const path = require('path');
const getAd = (req, res, db, fs, S3FSImplementation, aws) => {

    const {id} = req.params;
    db('ads')
        .select('*')
        .where({id: id})
        .then(ad => {
            let image = ad[0].image;
            let url = ad[0].url;
            let ext = image.slice((image.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
            return S3FSImplementation.readFile(image ,(err, data) => {
                if (err) {
                    console.log('erpr');
                    return res.json('Image Not Found in AWS');
                }
                let base64data = new Buffer(data).toString('base64');
                return res.json({
                    base64data: base64data,
                    url:url,
                    ext:ext
                });
            }).catch(err=>console.log('eror'));
            // return S3FSImplementation.getFile(ad[0].image,stream)
            //     return S3FSImplementation.readFile(stream.path, (err, data) => {
            //         if (err)
            //             console.log(err);
            //         console.log(data);
            //         res.json('aa', data);
            //     })
        }).catch(err => res.json(err));
};
const getAds=(req,res,db)=>{
    db('ads')//so ova se zemaat site ADS
        .select('*')
        .then(ads=>{
            res.status(200).json(ads);
        }).catch(err=>console.log(err));
};
const uploadAd = (req, res, db, urlExists, fs, S3FSImplementation, aws) => {
    // console.log('dadada');
    const s3 = new aws.S3();
    // const S3_BUCKET = process.env.S3_BUCKET;
    // console.log('s3', s3, 'aws', aws);

    let ad = req.files.adimage;
    const fileName = ad.originalFilename;
    const fileType = ad.type;

    let adurl = req.body.adurl;
    // console.log('TYPEOF ad.name i ad.originalfilename I type', typeof ad.name, typeof ad.originalFilename, typeof ad.type);

    let ext = ad.originalFilename.slice((ad.originalFilename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    ad.mimetype = ad.type.toLowerCase();
    if (!getFileExtension(ad.originalFilename)) {
        return res.status(400).json('Bad Request');
    }
    if (ad.type !== 'image/gif' && ad.type !== 'image/tiff' && ad.type !== 'image/jpg'
        && ad.type !== 'image/jpeg' && ad.type !== 'image/png') {
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
    console.log('dadadaBAZA');

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
                    console.log('VlagaAdadada');

                    let img = data[0].image;
                    let url = data[0].url;
                    console.log('adpath',ad.path);
                    const stream = fs.createReadStream(ad.path);
                    return S3FSImplementation.writeFile(img, stream)
                        .then(() => {
                            // console.log('da?');
                            fs.unlink(ad.path, (err => {
                                if (err) {
                                    console.log(err);
                                    res.status(400).json('er');
                                }
                                return res.json({
                                    file: `${img}`,
                                    url: url
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
    getAd:getAd
};
function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}