const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();
const port = process.env.PORT || 5000;
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const app = express();
// middleware
app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xongk.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });
async function run() {
    try {
        await client.connect();
        console.log('DB Connected')
        const serviceCollection = client.db(`mediCareDB`).collection('services');
        const bookingCollection = client.db(`mediCareDB`).collection('booking');
        const userCollection = client.db(`mediCareDB`).collection('userCollection');
        const doctorCollection = client.db(`mediCareDB`).collection('doctors');
        const paymentCollection = client.db(`mediCareDB`).collection('payments');
        // JWT Function
        function verifyJWT(req, res, next) {
            authHeader = req.headers.authorization;
            if (!authHeader) {
                return res.status(401).send({ message: 'UnAuthorized Access' });
            }
            else {
                const token = authHeader.split(' ')[1];
                jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
                    // err
                    if (err) {
                        return res.status(403).send({ message: 'Forbidden' })
                    }
                    req.decoded = decoded;
                });
                next();
            }
        }
        const verifyAdmin = async (req, res, next) => {
            const requester = req?.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                return res.status(403).send({ message: "Forbidded" })
            }
        }
        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const result = await cursor.toArray();
            res.send(result);
        })
        app.post('/service', async (req, res) => {
            const body = req.body;
            const query = { treatementName: body?.treatementName, date: body?.date, patientName: body?.patientName };
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(body);
            return res.send({ success: true, result })
        })
        app.delete('/service', async (req, res) => {
            const query = {}
            const result = await bookingCollection.deleteMany(query);
            res.send(result)
        })
        app.get('/available', async (req, res) => {
            //  Get all services
            const date = req?.query.date;
            const services = await serviceCollection.find().toArray();
            // get the booking of that day
            const query = { formatedDate: date };
            const bookings = await bookingCollection.find(query).toArray();
            //Step 3: forEach Service
            services.forEach(service => {
                const serviceBooking = bookings.filter(book => book.treatementName === service.name)
                const bookedSlots = serviceBooking.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
            })
            res.send(services)
        })
        // Load all booking
        app.get('/booking', verifyJWT, async (req, res) => {
            const email = req?.query?.email;
            const query = { email: email }
            const authorization = req.headers?.authorization;
            const decoded = req?.decoded?.email;
            if (email === decoded) {
                const result = await bookingCollection.find(query).toArray();
                res.send(result);
            }
            else {
                return res.status(403).send({ message: "Forbidded" })
            }
        })
        // Load user based on ID
        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req?.params.id;
            const query = { _id: ObjectId(id) }
            const result = await bookingCollection.findOne(query);
            res.send(result)
        })
        // Load all user
        app.get('/users', verifyJWT, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result)
        })
        // Update or create user profile
        app.put('/user/:email', async (req, res) => {
            const email = req?.params.email;
            const filter = { email: email };
            const user = req.body;
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })
            res.send({ result, token });
        });
        // Check is Admin or not
        app.get('/admin/:email', async (req, res) => {
            const email = req?.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin'
            res.send({ admin: isAdmin });
        })
        // Make admin 
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req?.params.email;
            const requester = req?.decoded?.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);
                return res.status(200).send(result);
            }
            else {
                return res.status(403).send({ message: "Forbidded" })
            }
        });
        // Remove admin 
        app.put('/user/remove-admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req?.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'noAdmin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.status(200).send(result);
        });
        // Get all doctors
        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const result = await doctorCollection.find().toArray();
            res.send(result)
        })
        // Create new Doctor
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result)
        })
        // Delete a Doctor
        app.delete('/removeDoctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const query = ({ email: email })
            const result = await doctorCollection.deleteOne(query);
            res.send(result)
        });
        // Create Payment Intent
        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card'],
            })
            res.send({ clientSecret: paymentIntent.client_secret })
        });
        // update payment info
        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = (req.body);
            const filter = { _id: ObjectId(id) }
            const option = { upsert: true }
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment?.transactionId,
                },
            };
            await paymentCollection.insertOne(payment);
            await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedDoc);
        })
    }
    finally {
    }
}
run().catch(console.dir);
app.get('/', (req, res) => {
    res.send('Running Genius Server');
});
app.listen(port, () => {
    console.log('Listening to port', port);
})
