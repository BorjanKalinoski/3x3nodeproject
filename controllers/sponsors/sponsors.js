const deleteSponsor = (req, res, db, S3FSImplementation) => {
    const {id} = req.params;
    db('sponsors')
        .where({id: id})
        .del()
        .returning(['id','image'])
        .then(sponsor=>{
            S3FSImplementation.unlink(sponsor[0].image, (err) => {
                if (err) {
                    console.log(err);
                    return res.status(400).json('Error deleteing image' + err).end();
                }
                return res.status(200).json("Deleted").end();
            });
        }).catch(err=>{
        console.log('Error here' + err);
        return res.status(200).json('Error HERE' + err).end();
    })
};
const getSponsor = (req, res, db, fs, S3FSImplementation) => {
    const {id} = req.params;
    db('sponsors')
        .select('*')
        .where({id: id})
        .then(sponsor => {
            console.log(sponsor, 'a ', sponsor[0].image);
            let readStream = S3FSImplementation.createReadStream(sponsor[0].image, 'utf-8');
            readStream.on('error', (err) => {
                res.status(400).json('Error loading sponsor' + err);
                return res.end();
            });
            return readStream.pipe(res);
        }).catch(err => res.status(400).json('Sponsor not found in database'));

};
const getSponsors = (req, res, db) => {
    db('sponsors')
        .select('*')
        .then(sponsors => {
            res.status(200).json(sponsors);
        }).catch(err => res.status(400).json('There are no sponsors'));
};
const uploadSponsor = (req, res, db, urlExists, fs, S3FSImplementation) => {
    let sponsor = req.files.sponsorimage;
    let url = req.body.sponsorurl;

    let ext = sponsor.originalFilename.slice((sponsor.originalFilename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    sponsor.mimetype = sponsor.type.toLowerCase();
    if (!getFileExtension(sponsor.originalFilename)) {
        return res.status(400).json('Bad Request');
    }
    if (sponsor.type !== 'image/gif' && sponsor.type !== 'image/jpg'
        && sponsor.type !== 'image/jpeg' && sponsor.type !== 'image/png' && sponsor.type !== 'image/webp') {
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
            image: sponsor.originalFilename,
            url: url
        })
        .returning('id')
        .then(id => {
            db('sponsors')
                .update({
                    image: `sponsor${id[0]}.${ext}`
                })
                .where('id', '=', id[0])
                .returning(['image', 'url'])
                .then(data => {
                    console.log('%c VO UPDATE', 'background: #222; color: #bada55');
                    console.log('data is', data);
                    let img = data[0].image;
                    let url = data[0].url;
                    console.log(sponsor.path);
                    console.log('a', img);
                    const stream = fs.createReadStream(sponsor.path).pipe(S3FSImplementation.createWriteStream(img, () => {
                        console.log('postoi');
                        if (err) {
                            db('sponsors').where({id: id[0]}).del().catch(err => {
                                console.log('Greska pri brisenje od baza', err);
                            });
                            console.log('GRESKATA E', err);
                            return res.status(400).json('Se slucuva nekakva greska ', err);
                        }
                        fs.unlink(sponsor.path, (err) => {
                            if (err) {
                                console.log('a ima i tuka', err);
                            }
                        });
                        return res.status(200).json({
                            file: `${img}`,
                            url: url,
                            id: id[0]
                        }).end();
                    }));

                    // }));
                    return;
                    // stream.pipe()
                    console.log('IMG VO WRITEFILE:', img);
                    console.log('Path vo writestream', sponsor.path);
                    return S3FSImplementation.writeFile(img, stream, (err) => {
                        if (err) {
                            db('sponsors').where({id: id[0]}).del().catch(err => {
                                console.log('Greska pri brisenje od baza', err);
                            });
                            console.log('GRESKATA E', err);
                            return res.status(400).json('Se slucuva nekakva greska ', err);
                        }
                        fs.unlink(sponsor.path, (err) => {
                            if (err) {
                                console.log('a ima i tuka', err);
                            }
                        });
                        return res.status(200).json({
                            file: `${img}`,
                            url: url,
                            id:id[0]
                        });
                    });
                });
        }).catch(error => res.status(400).json('GRESKA!!!!!', error));


};
function getFileExtension(filename) {
    let ext = filename.slice((filename.lastIndexOf('.') - 1 >>> 0) + 2).toLowerCase();
    return !(ext !== 'png' && ext !== 'jpeg' && ext !== 'jpg' && ext !== 'jpeg' && ext !== 'gif' && ext!=='webp');
}
module.exports={
    uploadSponsor:uploadSponsor,
    getSponsor:getSponsor,
    getSponsors:getSponsors,
    deleteSponsor:deleteSponsor
};