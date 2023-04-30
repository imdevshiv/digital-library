const dotenv = require('dotenv').config(); // to get .env values
const express = require('express');
//const path = require('path');
const ejs = require("ejs"); // require embeded javascript
const bodyParser = require('body-parser');
const mongoose = require("mongoose"); // to build connection between server and mongoDB
const session = require("express-session"); // to store user session details
const mongoStore = require("connect-mongo"); // it helps in storing session datas
const bcrypt = require("bcrypt"); // it will help to encrypt user password


// build connection with mongo
const mongodb_url = process.env.MONGO_URL; // getting mongo url
const mongodbOptions = { useNewUrlParser: true }; // mongo options need during making connection
const connectToMongoDB = async function () {
    try {
     mongoose.connect(mongodb_url,mongodbOptions);
      console.log("connected Success fully");
    } catch (error) {
      console.log(error); 
    }
}
connectToMongoDB();

const app = express();  // make express app firts
app.use(bodyParser.urlencoded({ extended: true })); // enables to get data from client side
app.use(express.static("public")); // to serve as a basic file to front side browser
app.set("view engine", "ejs"); // to render ejs files
// using session middle are for every routes - to get user Id and to authenticate them
app.use(session({
    secret: process.env.SECRET_SESSION,
    resave:false,
    saveUninitialized:false,
    store: mongoStore.create({
        mongoUrl: mongodb_url,
        collectionName: "Session"
    }),
    cookie:{
        maxAge: 1000*60*60*24*7 // 1 Week expairy date // 1000=1sec, 1000*60 = 1min , 1000*60*60 = 1hr ,1000*60*60*24*7 = 1 week  
        // cookies will be stored for one week and then automatically deleted.
    } 
}));


  // first define a schema
const usersSchema = new mongoose.Schema({
    name : String,
    email: String,
    userType : String,
    password: String,
});

const User = new mongoose.model("User", usersSchema);




// GET --- HOME ROUTE 
app.get("/",async (req,res)=>{
    if (req.session.isAuth === true) {
        // user_id is stored in session as req.session.user_ID 
        //check user type -- teacher or student 
       const foundUser = await User.findOne({_id:req.session.user_ID});
       if (foundUser) {
            if (foundUser.userType === "Student"){
                res.redirect(`/student/${req.session.user_ID}`);
            }else{
                res.redirect(`/teacher/${req.session.user_ID}`);
            }
       }else{
         res.render("home");
       }
    }
    else{
        res.render("home");
    }
})
app.get("/register",(req,res)=>{
    // res.sendFile('public/registration.html' , {root : __dirname});
    res.render("registration");
});
app.post("/register",async (req,res)=>{
   try {
        const name = req.body.name;
        const email = req.body.email;
        const userType = req.body.userType;
        const password = req.body.password;
        const foundUser = await User.findOne({email : email});
        if (foundUser) {
            res.send("User exists");
        }else{
            const newUser = new User({
                name : name,
                email : email,
                userType : userType,
                password : password
            });
           const savedUser = await newUser.save();
           // these session datas are being saved in my mongoDB data base -- browser only storing session id in the Cokie - which will be sent to server in every request it makes
           // when user is saved set session credentials
           req.session.user_ID = savedUser._id; // adding user id to session
           req.session.isAuth = true ; // setting authenticate property -true.. that will be cheked in the routes
           req.session.userType = findUser.userType ; // setting user type as teacher or student - will be required to check in upload routing
           // redirect according to user type page
           if(savedUser.userType === "Student" ) {
             res.redirect(`/student/${savedUser._id}`)
           }else if(savedUser.userType === "Teacher"){
             res.redirect(`/teacher/${savedUser._id}`)
           }
        }
   } catch (error) {
    console.log(error);
   }
})
app.get("/login",(req,res)=>{
   // res.sendFile('public/login.html' , {root : __dirname});
   res.render("login");
})
app.post("/login",async (req,res)=> {
    // const name = req.body.name;
    const email = req.body.email;
    const password = req.body.password;
    const findUser = await User.findOne({email: email});
    if (findUser) {
        //check pasword
        if (findUser.password === password) {
            //check wheather techer or student
            if (findUser.userType === "Teacher") {
                // sending teacher page
                // when user is saved set session credentials
                req.session.user_ID = findUser._id; // adding user id to session
                req.session.isAuth = true ; // setting authenticate property -true.. that will be cheked in the routes
                req.session.userType = findUser.userType ; // setting user type as teacher or student - will be required to check in upload routing
                res.redirect(`/teacher/${findUser._id}`)
            }else{
                // when user is saved set session credentials
                req.session.user_ID = findUser._id; // adding user id to session
                req.session.isAuth = true ; // setting authenticate property -true.. that will be cheked in the routes
                req.session.userType = findUser.userType ; // setting user type as teacher or student - will be required to check in upload routing
                // sending student page 
                res.redirect(`/student/${findUser._id}`)
            }
        }else{
            res.json({"msg" : "Entered wrong password."});
            res.redirect("/login");
        }
    }else{
        res.json({"msg" : "This user does not exists"});
        res.redirect("/register");
    }
});
app.get('/logout',(req,res)=>{
    // first check whether authorised or not
    if (req.session.isAuth === true) {
        req.session.destroy((err)=>{
            if (err) {
                console.log(err);
            }else{
                console.log("User loged out successfully");
                // redirect to home route
                res.redirect('/');
            }
        })
    }else{
    // send log in page
    res.redirect('/login');
    }
})
// get particular teacher & send teacher page
app.get("/teacher/:id",async (req,res)=>{
    // first check whether user is authenticated or not
    if (req.session.isAuth === true) {
        const foundUser = await User.findOne({_id:req.params.id});
        res.render("teacher", {user:foundUser});
    }else{
        // user is not authenticated and send login page
        res.redirect("/login");
    }
})
// get particular student & send student page
app.get("/student/:id",async (req,res)=>{
    if (req.session.isAuth === true) {
        const foundUser = await User.findOne({_id:req.params.id});
        res.render("student",{user:foundUser});
    }else{
        res.redirect('/login');
    }
})


app.get("/uploads/sem/:semNum", (req,res)=>{
    // here first check two things 1) whether user is authenti cated & 2) user is teacher or student --
    // bcoz if it is student it will be not allowed to upload any data
    const num = req.params.semNum;
    if (req.session.isAuth === true && req.session.userType === "Teacher") {
        // it is teacher & authenticated to upload docs
        res.render("semupload",{semesterNum : num });
    }else{
         // it is not authenticated - send login page
        res.redirect("/login");
    }
})



const port = 5000;
app.listen(port,function(){
    console.log("Server started on port " + `${port}`);
})