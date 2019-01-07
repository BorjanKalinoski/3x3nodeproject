const uploadSponsor = (req, res, db, urlExists, fs, S3FSImplementation) => {
    let sponsor = req.files.sponsorimage;
    let url = req.body.sponsorurl;
    // console.log(sponsor);
    // console.log(req.files);
    let ext = sponsor.originalFilename.slice((sponsor.originalFilename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    sponsor.mimetype = sponsor.type.toLowerCase();
    if (!getFileExtension(sponsor.originalFilename)) {
        return res.status(400).json('Bad Request');
    }
    if (sponsor.type !== 'image/gif' && sponsor.type !== 'image/tiff' && sponsor.type !== 'image/jpg'
        && sponsortype !== 'image/jpeg' && sponsor.type !== 'image/png') {
        return res.status(400).json('Bad Request');
    }
    if (!url) {
        url = null;
    } else {
        urlExists(url, (err, exists) => {
            if (!exists) {
                url = null;
            }
        });
    }
    db('sponsors')
        .insert({
            image:sponsor.originalFilename,
            url:url
        })
        .returning('id')
        .then(id=>{
            db('sponsors')
                .update({
                    image: `sponsor${id[0]}.${ext}`
                })
                .where('id', '=', id[0])
                .returning(['image', 'url'])
                .then(data => {
                    console.log('data is',data);
                    let img = data[0].image;
                    let url = data[0].url;
                    const stream = fs.createWriteStream(sponsor.path);
                    return S3FSImplementation.writeFile(img, stream)
                        .then(() => {
                            fs.unlink(sponsor.path, (err => {
                                if (err) {
                                    console.log('tuka',err);
                                    return res.status(400).json(err);
                                }
                                return res.json({
                                    file: img,
                                    url: url
                                });
                            }))

                        }).catch(err => console.log('greska', err));
                });

        })


};
function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'tif' && ext !== 'gif');
}
module.exports={
    uploadSponsor:uploadSponsor
};