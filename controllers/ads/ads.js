const deleteAd = (req, res, db, fs, S3FSImplementation) => {
    console.log('reqbody', req.body, 'params', req.params);
    const {id} = req.params;
    db('ads')
        .where({id: id})
        .del()
        .returning(['id', 'image'])
        .then(ad => {
            S3FSImplementation.unlink(ad[0].image, (err) => {
                if (err) {
                    console.log('Cant delete ad not found', err);
                    return res.status(400).json('Bad Request').end();
                }
                return res.status(200).end();
            });
        }).catch(err => {
        console.log('Cant delete ad not found in db', err);
        return res.status(400).json('No such image in database').end();
    });
};
const getAd = (req, res, db, fs, S3FSImplementation) => {
    const {id} = req.params;
    db('ads')
        .select('*')
        .where({id: id})
        .then(ad => {
            let readStream = S3FSImplementation.createReadStream(ad[0].image, 'utf-8');
            readStream.on('error', (err => {
                console.log('Ad not found', err);
                res.status(400).json('Bad Request');
                return res.end();
            }));
            return readStream.pipe(res);
        })
        .catch(err => {
                console.log('Ad not found in db', err);
                res.status(400).json('Bad Request');
            }
        );
};
const getAds = (req, res, db) => {
    db('ads')//so ova se zemaat site ADS
        .select('*')
        .then(ads => {
            res.status(200).json(ads);
        }).catch(err => console.log(err));
};
const uploadAd = (req, res, db, urlExists, fs, S3FSImplementation) => {
    let ad = req.files.adimage;
    let adurl = req.body.adurl;
    let ext = ad.originalFilename.slice((ad.originalFilename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    ad.mimetype = ad.type.toLowerCase();
    if (!getFileExtension(ad.originalFilename)) {
        return res.status(400).json('Bad Request');
    }
    if (ad.type !== 'image/gif' && ad.type !== 'image/jpg'
        && ad.type !== 'image/jpeg' && ad.type !== 'image/png' && ad.type!=='image/webp') {
        return res.status(400).json('Bad Request');
    }
    if (!adurl) {
        adurl = null;
    } else {
        urlExists(adurl, (err, exists) => {
            if (!exists) {
                adurl = null;
            }
        });
    }
    db('ads')
        .insert({
            image: ad.originalFilename,
            url: adurl
        })
        .returning('id')
        .then(id => {
            db('ads').update({
                image: `ad${id[0]}.${ext}`
            })
                .where('id', '=', id[0])
                .returning(['image', 'url'])
                .then(data => {
                    let img = data[0].image;
                    let url = data[0].url;
                    console.log('adpath', ad.path);
                    const stream = fs.createReadStream(ad.path);
                    return S3FSImplementation.writeFile(img, stream)
                        .then(() => {
                            fs.unlink(ad.path, (err => {
                                if (err) {
                                    console.log(err);
                                    res.status(400).json('er');
                                }
                                console.log(url);
                                return res.json({
                                    file: `${img}`,
                                    url: url,
                                    id: id[0]
                                });
                            }))
                        }).catch(err => {
                            console.log('eeeeeeeee');
                            return res.status(400).json(err);
                        });
                    // ^ is good

                    // const reqPath = path.join(__dirname, '..\\..\\');
                    // const s3 = new aws.S3();
                    // const s3Params = {
                    //     Bucket: '3x3macedonia',
                    //     Key: img,
                    //     Expires: 60,
                    //     ContentType: fileType,
                    //     ACL: 'public-read'
                    // };
                    // s3.upload(s3Params,(err,data)=>{
                    //     if(err) {
                    //         console.log(err);
                    //         res.json(err);
                    //     }
                    //     console.log('success');
                    //     console.log(data);
                    //     res.json(data);
                    // });

                    // ad.mv(`${reqPath}/public/${img}`, (err) =>{
                    //     if (err) {
                    //         console.log(err);
                    //         return res.status(500).send(err);
                    //     }
                    //     res.json({
                    //         file: `${img}`,
                    //         url: url
                    //     });
                    // });
                }).catch(err => console.log(err));
        }).catch(err => console.log(err));
};
module.exports = {
    getAds: getAds,
    uploadAd: uploadAd,
    getAd: getAd,
    deleteAd: deleteAd
};

function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif' && ext !== 'webp');
}