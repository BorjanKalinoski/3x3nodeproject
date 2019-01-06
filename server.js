const express = require('express');
const bodyParser = require('body-parser');
const bcrypt = require('bcrypt-nodejs');
const cors = require('cors');
const knex = require('knex');
const moment = require('moment');
const aws = require('aws-sdk');
const S3FS= require('s3fs');
const fs = require('fs');
const S3FSImplementation = new S3FS('3x3macedonia', {
    // accessKeyId: 'AKIAIHWLUM63AAXH47QA',
    // AKIAIHWLUM63AAXH47QA
    accessKeyId: 'AKIAIHWLUM63AAXH47QA',
    secretAccessKey: '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',
    //n+pH/aOAoft3ILuFCeVaGZQeLNn4i0JZg8E+9xLc
    // secretAccessKey: '5/QgvIHSL/kX26EhBwkD1o9JODWBoJPB/41GkE9D',
    region:'eu-west-2',
});
// S3FSImplementation.create();
// (async function () {
//     try {
//         aws.config.setPromisesDependency();
//         aws.config.update({
//             accessKeyId: 'AKIAIHWLUM63AAXH47QA',
//             secretAccessKey: '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',
//             region: 'eu-west-2',
//         });
//         const s3 = new aws.S3();
//         const response = s3.listObjectsV2({
//             Bucket: '3x3macedonia',
//         }).promise();
//         console.log(response);
//     }catch (e) {
//         console.log('error is ',e);
//     }
//     debugger;
// })();
const multiparty = require('connect-multiparty');
// const upload = require('express-fileupload');
const urlExists = require('url-exists');

const posts = require('./controllers/posts/posts');
const ads = require('./controllers/ads/ads');

const db =knex({
    client: 'pg',//deka koristi PostgreSQL
    connection: {
        // host : '127.0.0.1',
        // host: ' postgresql-concave-31306',
        connectionString: process.env.DATABASE_URL,



        ssl:true,
        // user: 'borjan',
        // user : 'postgres',
        // password: '',
        // database: '3x3macedonia'
    }
});
const app=express();
const multipartyMiddleware=multiparty();
//anythight that should go to S3 it is getting processed
// to multipartmiddleware, intercepts the file and saves it %temp% requiest.files.file obect,
// router.use(multipartMiddleware);
app.set('views','./views');
app.use(express.static('./public'));

// app.use(express.static('./public'));
app.engine('html', require('ejs').renderFile);
app.use(bodyParser.json());
app.use(cors());
// app.use(upload());
app.use(multiparty(multipartyMiddleware));
// const S3_BUCKET = process.env.S3_BUCKET;
console.log('port', Number(process.env.PORT));
aws.config.region = 'eu-west-2';
// app.get('/account', (req, res) => res.render('account.html'));
app.get('/',(req,res)=>{
   res.json('Hello world');
});
app.get('/sponsors',(req,res)=>{
   db('sponsors')
       .select('*')
       .then(sponsors=>{
           res.status(200).json(sponsors);
       }).catch(err=>console.log(err));
});
app.get('/aboutus',(req,res)=>{
    db('aboutus')
        .select('*')
        .then(aboutusimages=>{
            res.status(200).json(aboutusimages);
        }).catch(err=>console.log(err));
});
console.log('THE BUCKET IS', process.env.S3_BUCKET);

app.get('/ad/:id',(req,res)=>{ads.getAd(req,res,db,fs,S3FSImplementation,aws)});
app.get('/ads',(req,res)=>{ads.getAds(req,res,db);});
app.post('/uploadad',(req,res)=>{ads.uploadAd(req,res,db,urlExists,fs,S3FSImplementation,aws);});
app.post('/post',(req,res)=>{posts.uploadPost(req,res,db,moment)});
app.get('/getposts',(req,res)=>{posts.getPosts(req,res,db)});

app.post('/signin',(req,res)=>{
    const {username , password} =req.body;

    db.select('hash','username')
        .where({username:username})
        .from('login')
        .then(data=>{  //data sto se vratilo od prethodnoto( email, hash )
            if(bcrypt.compareSync(password,data[0].hash)){
                return db.select('*')
                    .from('users')
                    .where('username','=',username)
                    .then(user=>{
                        res.json(user[0]);
                    })
                    .catch(err=>res.status(400).json('Unable to get user'))
            }
            res.status(400).json('Wrong Credentials');
        })
        .catch(err=>res.status(400).json('Wrong Credentials'));
});
//username, password
app.post('/register',(req,res)=>{
    const {username,password} = req.body;
    const hash= bcrypt.hashSync(password);

    db.transaction(trx => {
        trx.insert({
            hash:hash,
            username:username
        })
            .into('login')
            .returning('username')
            .then(loginUsername=>{
                return trx('users')
                    .returning('*')
                    .insert({
                        username:loginUsername[0]
                    })
                    .then(response=>{
                        res.json(response[0]);
                    })
            })
            .then(trx.commit)
            .catch(trx.rollback)
    }).catch(err=>res.status(400).json('Bad Request'));
});

app.listen(process.env.PORT || 3001,()=>{
    console.log(`app is running on port ${process.env.PORT}`);
});
