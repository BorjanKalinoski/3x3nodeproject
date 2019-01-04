const path = require('path');
const getAd=(req,res,db)=>{
    const {id} = req.params;
    console.log(id);
    db('ads')
        .select('*')
        .where({id:id})
        .then(ad=>{
            console.log(ad[0]);
            return res.json(ad[0]);
        }).catch(err=>{
        console.log(err);
        return res.status(404).json('Image not found');
    });
};
const getAds=(req,res,db)=>{
    db('ads')//so ova se zemaat site ADS
        .select('*')
        .then(ads=>{
            res.status(200).json(ads);
        }).catch(err=>console.log(err));
};
const uploadAd= (req,res,db,urlExists)=>{
    let ad = req.files.adimage;
    let adurl = req.body.adurl;
    let ext = ad.name.slice((ad.name.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    ad.mimetype = ad.mimetype.toLowerCase();
    if(!getFileExtension(ad.name)) {
        return res.status(400).json('Bad Request');
    }
    if (ad.mimetype !== 'image/gif' && ad.mimetype !== 'image/tiff' && ad.mimetype !== 'image/jpg'
        && ad.mimetype !== 'image/jpeg' && ad.mimetype !== 'image/png') {
        return res.status(400).json('Bad Request');
    }
    if(!adurl) {
        adurl = null;
    }else{
        urlExists(adurl,(err,exists)=>{
            if (!exists) {
                adurl = null;
            }
        });
    }
    db('ads')
        .insert({
            image: ad.name,
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
                    const reqPath = path.join(__dirname, '..\\..\\');
                    ad.mv(`${reqPath}/public/${img}`, (err) =>{
                        if (err) {
                            console.log(err);
                            return res.status(500).send(err);
                        }
                        res.json({
                            file: `${img}`,
                            url: url
                        });
                    });
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