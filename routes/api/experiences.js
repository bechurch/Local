var express = require('express');
var router = express.Router();
var db = require('../../models');
var fs = require('fs');
var math  = require('mathjs');
var validator = require('validator');
var geocoderProvider = 'google';
var httpAdapter = 'http';
var geocoder = require('node-geocoder').getGeocoder(geocoderProvider, httpAdapter);


router.get('/all', function(req, res) {
    db
        .Experience
        .findAll()
        .complete(function(err, experiences) {
            if(!!err) {
                console.log("An error occurred retrieving experiences:", err);
                res.send("An error occurred retrieving experiences");
            } else if (!experiences) {
                console.log("no experiences found");
                res.send("no experiences found");
            } else {
                res.set('Content-Type', 'application/json');
                var returnObject = {
                    experiences:experiences
                };

                res.send(JSON.stringify(returnObject));
            }
        })

});
/* GET users listing. */
router.get('/', function(req, res) {
    //insert stuff for high level experience

    if (!req.query.distance || !validator.isFloat(req.query.distance)) {
        res.json ("need a distance");
    }

    else if (!req.query.lat || !validator.isFloat(req.query.lat)) {
        res.json ("need a lat coord");
    }

    else if (!req.query.lng || !validator.isFloat(req.query.lng)) {
        res.json ("need a lng coord");
    }
    else {
        var distance = validator.escape(req.query.distance);
        console.log(distance);

        var lat = validator.escape(parseFloat(req.query.lat));
        console.log(lat);

        var lng = validator.escape(parseFloat(req.query.lng));
        console.log(lng);

        /*calc range
         http://janmatuschek.de/LatitudeLongitudeBoundingCoordinates
        we need to:
        1. convert the radius given from km to lat degrees
        2. convert the radius given to lng degrees
        3. calculate lng-radius.lng, lng+radius.lng
        4. calculate lat-radius.lat, lat+radius.lat
        5. find all experiences in range
         */

        //1. convert radius into lat degrees

        //convert lat, lng from degrees to radians
        lat = lat * math.pi / 180;
        lng = lng * math.pi / 180;

        var great_circle_distance = 6371; //km
        var angular_radius = distance/great_circle_distance;

        var lat_min = lat - angular_radius;
        var lat_max = lat + angular_radius;

        var delta_lng = math.asin(math.sin(angular_radius)/math.cos(lat));
        var lng_min = lng - delta_lng;
        var lng_max = lng + delta_lng;

        //TODO: dealing with poles and the 180th meridian

        //north pole in query
        if (lat_max > (math.pi/2)){
            lng_min = -math.pi;
            lat_max = math.pi/2;
            lng_max = math.pi;
        }

        //south pole in query
        if (lat_min < (-math.pi/2)) {
            lat_min = -math.pi/2;
            lng_min = -math.pi;
            lng_max = math.pi;
        }

        //180th meridian
        if (lng_min < -math.pi || lng_max > math.pi){
            lng_min = -math.pi;
            lng_max = math.pi;

        }
        console.log("lat min: " + lat_min + "lat max: " + lat_max + "lng min: " + lng_min + "lng max: " + lng_max);

        var sql_query = "SELECT * FROM experiences WHERE is_active AND (radians(latitude) >= "
            + lat_min
            +  " AND radians(latitude) <= "
            + lat_max
            + ") AND (radians(longitude) >= "
            + lng_min
            + " AND radians(longitude) <= "
            + lng_max
            + ") AND acos(sin("
            + lat
            + ") * sin(radians(latitude)) + cos("
            + lat
            + ") * cos(radians(latitude)) * cos(radians(longitude) - ("
            + lng
            + "))) <= "
            + angular_radius;

        db
            .sequelize
            .query(sql_query)
            .success(function (local_experiences){
                res.set('Content-Type', 'application/json');
                var returnObject = {
                    experiences:local_experiences
                };

                res.send(JSON.stringify(returnObject));

            });
    }



});

router.get('/:id', function(req, res) {
    db.Experience
        .find({ where: { id: req.params.id } })
        .complete(function(err, experience) {
            if (!!err) {
                console.log('An error occurred while searching for experience:', err)
            } else if (!experience) {
                console.log('No experience with the id has been found.')
            } else {
                res.set('Content-Type', 'application/json');
                res.json(experience.values);
            }
        })
});
router.post('/', function(req, res) {
    var username = req.body.username;
    var password = req.body.password;

    var title = req.body.title;
    var price = req.body.price;
    var rate = req.body.rate;
    var description = req.body.description;
    var email = req.body.email;
    var phone_number = req.body.phone_number;
    var address = req.body.address;

    var is_secret = req.body.is_secret;

    if(!username || !password || !title || !price || !rate || !description || !email || !phone_number || !address){
        res.json("missing parameters!");
    }

    else if (!validator.isEmail(email)){
        res.json("Please enter a valid email address");
    }

    else if (!is_secret) {
        res.json("Please specify if secret or experience")
    }

    else{
        geocoder.geocode(address, function(err, geoData) {
            if (!!err) {
                res.json("error occured when looking up address");
                console.log("error occured when looking up address: " + err);
            }
            else {
                db
                    .User
                    .find({ where: { username:username, password:password } })
                    .complete(function(err, user) {
                        if (!!err) {
                            res.send('An error occurred while searching user:', err);
                            console.log('An error occurred while searching user:', err);
                        } else if (!user) {
                            res.send('No user with those credentials exist');
                            console.log('No user with those credentials exist');
                        } else {
                            // credentials given match
                            var experience = db.Experience.build({
                                title: title,
                                price: price,
                                rate: rate,
                                description: description,
                                email: email,
                                phone_number: phone_number,
                                latitude: geoData[0].latitude,
                                longitude: geoData[0].longitude,
                                street_name: geoData[0].streetName,
                                street_number: geoData[0].streetNumber,
                                zipcode: geoData[0].zipcode,
                                state: geoData[0].state,
                                city: geoData[0].city,
                                country: geoData[0].country,
                                is_secret: is_secret
                            });
                            experience
                                .save()
                                .complete(function(err, experience) {
                                    if (!!err) {
                                        console.log('The instance has not been saved:', err);
                                        res.json(err.detail);
                                    } else {
                                        console.log('We have a persisted instance now');
                                        experience
                                            .setUser(user)
                                            .complete(function(err){
                                                if(!!err){
                                                    console.log("failed to associate experience with user");
                                                } else {
                                                    console.log("associated successfully!")
                                                }
                                            });
                                        res.send(200)
                                    }
                                });
                        }
                    })
            }

        });

    }

});

router.put('/:id', function(req, res) {
    var experience_id = req.params.id;

    var username = req.body.username;
    var password = req.body.password;

    var title = req.body.title;
    var price = req.body.price;
    var rate = req.body.rate;
    var description = req.body.description;
    var email = req.body.email;
    var phone_number = req.body.phone_number;

    var is_secret = req.body.is_secret;

    //let a user specify a new address by the actual address or coords
    var address = req.body.address;

    //other set
    var latitude = req.body.latitude;
    var longitude = req.body.longitude;

    var submittedAddress = false;

    if (address) {
        submittedAddress = true;
    }
    else if (latitude && longitude) submittedAddress = true;

    if(!username || !password || !title || !price || !rate || !description || !email || !phone_number || !submittedAddress){
        res.json("missing parameters!");
    }

    else if (!validator.isEmail(email)) {
        res.json("Please enter a valid email address");

    }

    else if (!is_secret) {
            res.json("Please specify if secret or experience")
        }

    //all needed values present
    else{
        db
            .User
            .find({ where: { username:username, password:password } })
            .complete(function(err, user) {
                if (!!err) {
                    res.send('An error occurred while searching user:', err);
                    console.log('An error occurred while searching user:', err);
                } else if (!user) {
                    res.send('No user with those credentials exist');
                    console.log('No user with those credentials exist');
                } else {
                    // user credentials given match
                    db
                        .Experience
                        .find({ where: { id: experience_id}})
                        .complete(function (err, experience) {
                            if (!!err) {
                                console.log('An error occurred while searching experience:', err);
                                res.json('An error occurred while searching experience');
                            } else if (!experience) {
                                console.log('No experience matches the id');
                                res.json('No experience matches the id');
                            }
                            else {
                                if (!experience.hasUser(user)) {
                                    res.json('user does not own this experience')
                                }
                                else {
                                    //experience exists, user exists, user owns experience
                                    experience.title = title;
                                    experience.price = price;
                                    experience.rate = rate;
                                    experience.description = description;
                                    experience.email = email;
                                    experience.phone_number = phone_number;
                                    experience.is_secret = is_secret;

                                    if (address){
                                        //get the address from google
                                        geocoder.geocode(address, function(err, geoData) {
                                            if (!!err) {
                                                res.json("error occured when looking up address");
                                                console.log("error occured when looking up address: " + err);
                                            }
                                            else {
                                                //update the address with the geocoded stuff

                                                experience.latitude =  geoData[0].latitude;
                                                experience.longitude = geoData[0].longitude;
                                                experience.street_name = geoData[0].streetName;
                                                experience.street_number = geoData[0].streetNumber;
                                                experience.zipcode = geoData[0].zipcode;
                                                experience.state = geoData[0].state;
                                                experience.city = geoData[0].city;
                                                experience.country = geoData[0].country;
                                                experience
                                                    .save()
                                                    .complete(function(err){
                                                        if (!!err) {
                                                            console.log(err);
                                                            res.json('failed to update the experience');
                                                        }
                                                        else {
                                                            res.send(200);
                                                        }
                                                    });

                                            }
                                        })
                                    }
                                    else {
                                        //update lat lng
                                        experience.latitude = latitude;
                                        experience.longitude = longitude;
                                        experience
                                            .save()
                                            .complete(function(err){
                                                if (!!err) {
                                                    console.log(err);
                                                    res.json('failed to update the experience');
                                                }
                                                else {
                                                    res.send(200);
                                                }
                                            });
                                    }

                                }
                            }
                        });


                }
            })


        };

});

router.delete('/:id', function(req, res) {
        var username = req.body.username;
        var password = req.body.password;
        var experience_id = req.params.id;


        console.log(username + " " + password);
        db
            .User
            .find({ where: { username: username, password: password } })
            .complete(function (err, user) {
                if (!!err) {
                    console.log('An error occurred while searching user:', err);
                    res.json('An error occurred while searching user');
                } else if (!user) {
                    console.log('No user with those credentials exist', err);
                    res.json('No user with those credentials exist');
                }
                else {
                    db
                        .Experience
                        .find({ where: { id: experience_id}})
                        .complete(function (err, experience) {
                            if (!!err) {
                                console.log('An error occurred while searching experience:', err);
                                res.json('An error occurred while searching experience');
                            } else if (!experience) {
                                console.log('No experience matches the id');
                                res.json('No experience matches the id');
                            }
                            else {
                                if (!experience.hasUser(user)) {
                                    res.json('user does not own this experience')
                                }
                                else {
                                    experience
                                        .destroy()
                                        .complete(function(err){
                                            if(!!err) {
                                                console.log(err);
                                                res.json('experience failed to delete from database');
                                            }
                                            else {
                                                res.send(200);
                                            }
                                        })
                                }


                            }

                        })
                }
            })
    }
);

function isEmptyObject(obj) {
    return !Object.keys(obj).length;
}

function deleteImage(res, experience, image_label) {
    var public_dir = 'public';
    var path_to_unlink;
    var accepted_fieldnames = ["image0", "image1", "image2", "image3", "image4", "image5"];

    switch(accepted_fieldnames.indexOf(image_label)) {

        case 0:
            //image0
            if(experience.image0) {

                path_to_unlink = public_dir + experience.image0;
                experience.image0 = null;
            }
            break;

        case 1:
            //image1
            if(experience.image1) {
                path_to_unlink = public_dir + experience.image1;
                experience.image1 = null;

            }
            break;

        case 2:
            //image2
            if(experience.image2) {
                path_to_unlink = public_dir + experience.image2;
                experience.image2 = null;

            }
            break;

        case 3:
            //image3
            if(experience.image3) {
                path_to_unlink = public_dir + experience.image3;
                experience.image3 = null;

            }
            break;

        case 4:
            //image4
            if(experience.image4) {
                path_to_unlink = public_dir + experience.image4;
                experience.image4 = null;
            }
            break;

        case 5:
            //image5
            if(experience.image5) {
                path_to_unlink = public_dir + experience.image5;
                experience.image5 = null;
            }
            break;

        default:
            console.log("hit default during delete: " + image_label);

    }
    if (experience.image0) {
        experience.is_active = true;
    }
    else {
        experience.is_active = false;
    }
    //todo: need error catching if this fails

    experience
        .save()
        .complete(function(err){
            if (!!err) {
                console.log(err);
                res.json('Image failed to delete from database');
            }
            else {
                if (path_to_unlink) {
                    fs.unlink(path_to_unlink);
                    console.log('successfully deleted ' + path_to_unlink);
                    res.send(200);

                }
                else res.json('no image to delete');
            }
        });


}

router.delete('/:id/image/:image_label', function(req, res) {
        var username = req.body.username;
        var password = req.body.password;
        var experience_id = req.params.id;
        var image_label = req.params.image_label;

        console.log(username + " " + password);
        db
            .User
            .find({ where: { username: username, password: password } })
            .complete(function (err, user) {
                if (!!err) {
                    console.log('An error occurred while searching user:', err);
                    res.json('An error occurred while searching user');
                } else if (!user) {
                    console.log('No user with those credentials exist');
                    res.json('No user with those credentials exist');
                }
                else {
                    db
                        .Experience
                        .find({ where: { id: experience_id}})
                        .complete(function (err, experience) {
                            if (!!err) {
                                console.log('An error occurred while searching experience:', err);
                                res.json('An error occurred while searching experience');
                            } else if (!experience) {
                                console.log('No experience matches the id');
                                res.json('No experience matches the id');
                            }
                            else {
                                if (!experience.hasUser(user)) {
                                    res.json('user does not own this experience')
                                }
                                else {
                                    deleteImage(res, experience, image_label)
                                }


                            }

                        })
                }
            })
    }
);

router.post('/:id/upload_images', function(req, res) {

    /*
     1. check if it is an image (done in the app.js use call)
     2. check for appropriate credentials
     3. check for experience with id
     4. upload image
     5. on success write image location to experience
     */
    if (isEmptyObject(req.files)) {
        console.log("500 bitch, no files");
        res.send(500);

    }
    else {

        var username = req.body.username;
        var password = req.body.password;
        var experience_id = req.params.id;
        //var image_path = req.files;
        console.log('username: ' + username + ' password: ' + password + ' id: ' + experience_id);
        console.log(req.files);
        //2. check credentials

        db
            .User
            .find({ where: { username: username, password: password } })
            .complete(function (err, user) {
                if (!!err) {
                    console.log('An error occurred while searching user:', err);
                    imageUploadFailed(res, 'An error occurred while searching user:', req.files);
                } else if (!user) {
                    console.log('No user with those credentials exist');
                    imageUploadFailed(res, 'No user with those credentials exist', req.files);
                }
                else {
                    db
                        .Experience
                        .find({ where: { id: experience_id}})
                        .complete(function (err, experience) {
                            if (!!err) {
                                console.log('An error occurred while searching experience:', err);
                                imageUploadFailed(res, 'An error occurred while searching experience:', req.files);
                            } else if (!experience) {
                                console.log('No experience matches the id');
                                imageUploadFailed(res, 'No experience matches the id', req.files);
                            }
                            else {
                                if (!experience.hasUser(user)) {
                                    imageUploadFailed(res, 'user does not own this experience', req.files)
                                }
                                else {
                                    imageUploadSuccess(res, experience, req.files)
                                }


                            }

                        })
                }
            })
    }
});

function imageUploadFailed (res, message, image_path) {

    for (var i = 0; i < image_path.length; i++) {

        fs.unlink(image_path[i].path, function (err) {
            if (err) throw err;
            console.log('successfully deleted ' + image_path[i]);
        });
    }

    res.send(message);
}

function imageUploadSuccess (res, experience, files) {
    var public_dir = 'public';
    var accepted_fieldnames = ["image0", "image1", "image2", "image3", "image4", "image5"];
    console.log(files);
    for (i in files)
    {
        console.log("switching");
        switch(accepted_fieldnames.indexOf(i)) {

            case 0:
                //image0
                if(experience.image0) {
                    fs.unlink(public_dir + experience.image0);
                    console.log('successfully deleted ' + experience.image0);
                }
                experience.image0 = files[i].path.replace('public', '');
                break;

            case 1:
                if(experience.image1) {
                    fs.unlink(public_dir + experience.image1);
                    console.log('successfully deleted ' + experience.image1);
                }
                experience.image1 = files[i].path.replace('public', '');
                break;

            case 2:
                if(experience.image2) {
                    fs.unlink(public_dir + experience.image2);
                    console.log('successfully deleted ' + experience.image2);
                }
                experience.image2 = files[i].path.replace('public', '');
                break;

            case 3:
                if(experience.image3) {
                    fs.unlink(public_dir + experience.image3);
                    console.log('successfully deleted ' + experience.image3);
                }
                experience.image3 = files[i].path.replace('public', '');
                break;

            case 4:
                if(experience.image4) {
                    fs.unlink(public_dir + experience.image4);
                    console.log('successfully deleted ' + experience.image4);
                }
                experience.image4 = files[i].path.replace('public', '');
                break;

            case 5:
                if(experience.image5) {
                    fs.unlink(public_dir + experience.image5);
                    console.log('successfully deleted ' + experience.image5);
                }
                experience.image5 = files[i].path.replace('public', '');
                break;

            default:

                console.log("hit default: "+ i);

        }
    }

    if (experience.image0) {
        experience.is_active = true;
    }
    else {
        experience.is_active = false;
    }
    console.log("about to save");
    experience
        .save()
        .complete(function(err){
            if (!!err) {
                console.log(err);
                imageUploadFailed(res, 'Image failed to save to database', image_path);
            }
            else res.send(200);
        });


}
module.exports = router;
