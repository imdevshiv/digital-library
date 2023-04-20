const dotenv = require('dotenv').config(); // to get .env values
const express = require('express');
const app = express();  // make app
//const path = require('path');
const ejs = require("ejs"); // require embeded javascript
const bodyParser = require('body-parser');
const mongoose = require("mongoose"); // to build connection between server and mongoDB
app.use(express.static("public")); // to serve as a basic file front side browser
app.use(bodyParser.urlencoded({ extended: true }));


app.set("view engine", "ejs");
app.use(express.static("public"));

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
  // first define a schema
const usersSchema = new mongoose.Schema({
    name : String,
    email: String,
    userType : String,
    password: String,
});

const User = new mongoose.model("User", usersSchema);


// GET --- HOME ROUTE 
app.get("/",(req,res)=>{
    // res.sendFile('public/home.html' , {root : __dirname});
    res.render("home");
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
           console.log(savedUser);
           // redirect according to user type page
           if(savedUser.userType === "Student" ) {
             res.redirect(`/student/${savedUser._id}`)
           }else if(savedUser.userType === "Teacher"){
             res.redirect(`/teacher/${savedUser._id}`)
           }
        }
   } catch (error) {
    
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
                res.redirect(`/teacher/${findUser._id}`)
            }else{
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
app.get("/teacher/:id",async (req,res)=>{
    const foundUser = await User.findOne({_id:req.params.id});
    console.log(foundUser);
    res.render("teacher", {user:foundUser});
})
app.get("/student/:id",async (req,res)=>{
    const foundUser = await User.findOne({_id:req.params.id});
    console.log(foundUser);
    res.render("student",{user:foundUser});
})

app.listen(5000,function(){
    console.log("Server started on port 5000");
})