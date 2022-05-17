const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
// const res = require('express/lib/response');
require('dotenv').config();
const port = process.env.PORT || 5000;

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
        // console.log("DB COnnected")
        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
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

        app.get('/booking', async (req, res) => {

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
