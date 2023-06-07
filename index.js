const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_ACESS_TOKEN);
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;

//middleware
app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res
      .status(401)
      .send({ error: true, message: "Unauthorizaed access" });
  }
  const token = authorization.split(" ")[1];
  jwt.verify(token, process.env.ACESS_TOKEN_SECURITY, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({ error: true, message: "Unauthorizaed access" });
    }
    req.decoded = decoded;
    next();
  });
};
//mongodb start
const uri = `mongodb+srv://${process.env.DB_USERNAME}:${process.env.DB_PASSWORD}@cluster0.6wlkevy.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    //start

    const userCollections = client.db("bistro-resturantDB").collection("users");
    const menuData = client.db("bistro-resturantDB").collection("menu");
    const reviewData = client.db("bistro-resturantDB").collection("reviews");
    const payemtCollention = client
      .db("bistro-resturantDB")
      .collection("payments");
    const catrsCollections = client
      .db("bistro-resturantDB")
      .collection("carts");

    //jwt
    app.post("/jwt", (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACESS_TOKEN_SECURITY, {
        expiresIn: "1h",
      });
      res.send({ token });
    });

    //
    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await userCollections.findOne(query);
      if (user?.role !== "admin") {
        return res
          .status(403)
          .send({ error: true, message: "bro you are not authoraized person" });
      }
      next();
    };

    // get users
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await userCollections.find().toArray();
      res.send(result);
    });
    //users data insert
    app.post("/users", async (req, res) => {
      const userData = req.body;
      const query = { email: userData.email };
      const exitingUser = await userCollections.findOne(query);
      if (exitingUser) {
        return res.send({ message: "user has already exited" });
      }
      const result = await userCollections.insertOne(userData);
      res.send(result);
    });

    //user delete

    // user admin
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;

      if (req.decoded.email !== email) {
        res.send({ admin: false });
      }

      const query = { email: email };
      const user = await userCollections.findOne(query);
      const result = { admin: user?.role === "admin" };
      res.send(result);
    });

    //simple data edit
    app.patch("/users/admin/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const UpdateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await userCollections.updateOne(filter, UpdateDoc);
      res.send(result);
    });
    //get menu datas
    app.get("/menus", async (req, res) => {
      const result = await menuData.find().toArray();
      res.send(result);
    });

    //add menu
    app.post("/menus", verifyJWT, verifyAdmin, async (req, res) => {
      const menuss = req.body;
      const result = await menuData.insertOne(menuss);
      res.send(result);
    });
    //data delete
    app.delete("/menus/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { $or: [{ _id: new ObjectId(id) }, { _id: id }] };
      const result = await menuData.deleteOne(query);
      res.send(result);
    });

    //get reviews datas
    app.get("/reviwes", async (req, res) => {
      const result = await reviewData.find().toArray();
      res.send(result);
    });

    //carts
    //get data
    app.get("/carts", verifyJWT, async (req, res) => {
      const email = req.query.email;
      if (!email) {
        res.send([]);
      }
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res
          .status(403)
          .send({ error: true, message: "Forbidden access" });
      }
      const query = { email: email };
      const result = await catrsCollections.find(query).toArray();
      res.send(result);
    });
    //insert data
    app.post("/carts", async (req, res) => {
      const items = req.body;
      const result = await catrsCollections.insertOne(items);
      res.send(result);
    });

    //data delete
    app.delete("/carts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await catrsCollections.deleteOne(query);
      res.send(result);
    });

    //payment methods start
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const { price } = req.body;
      const amount = parseInt(price * 100);

      // Create a PaymentIntent with the order amount and currency
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    //payment data insert
    app.post("/payments", verifyJWT, async (req, res) => {
      const payment = req.body;
      const insertResult = await payemtCollention.insertOne(payment);

      const query = {
        _id: { $in: payment.cartItems.map((id) => new ObjectId(id)) },
      };
      const deleteResult = await catrsCollections.deleteMany(query);

      res.send({ insertResult, deleteResult });
    });
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

//test
app.get("/", (req, res) => {
  res.send("dishes data coming..............");
});

//connection
app.listen(port);
