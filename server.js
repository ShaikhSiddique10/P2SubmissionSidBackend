// Import required modules
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const bodyParser = require('body-parser');

// Set up Express app
const app = express();
app.use(bodyParser.json());

// MongoDB Connection
mongoose.connect('mongodb://localhost:27017/auctionDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.log('Error connecting to MongoDB:', err));

// User Schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

// AuctionItem Schema
const auctionItemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  startingBid: { type: Number, required: true },
  auctionEndTime: { type: Date, required: true },
  highestBid: { type: Number, default: 0 },
  highestBidder: { type: String, default: '' },
  isClosed: { type: Boolean, default: false }
});

const User = mongoose.model('User', userSchema);
const AuctionItem = mongoose.model('AuctionItem', auctionItemSchema);

// Helper function to generate JWT
const generateToken = (userId) => {
  return jwt.sign({ userId }, 'secretkey', { expiresIn: '1h' });
};

// User Sign-Up Route
app.post('/signup', async (req, res) => {
  const { username, email, password } = req.body;

  try {
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser = new User({ username, email, password: hashedPassword });
    await newUser.save();

    res.status(201).json({ message: 'User created successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error creating user', error });
  }
});

// User Sign-In Route
app.post('/signin', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: 'User not found' });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: 'Invalid password' });

    const token = generateToken(user._id);
    res.status(200).json({ message: 'Signed in successfully', token });
  } catch (error) {
    res.status(500).json({ message: 'Error signing in', error });
  }
});

// Auction Item Creation Route (Add Auction)
app.post('/auction', async (req, res) => {
  const { title, description, startingBid, auctionEndTime } = req.body;

  try {
    const newAuctionItem = new AuctionItem({
      title,
      description,
      startingBid,
      auctionEndTime
    });
    await newAuctionItem.save();

    res.status(201).json({ message: 'Auction created successfully', auctionItem: newAuctionItem });
  } catch (error) {
    res.status(500).json({ message: 'Error creating auction', error });
  }
});

// Place Bid Route
app.post('/bid/:id', async (req, res) => {
  const { id } = req.params;
  const { bidAmount, bidderName } = req.body;

  // Check if the provided ID is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid auction item ID' });
  }

  try {
    const auctionItem = await AuctionItem.findById(id);
    if (!auctionItem) return res.status(404).json({ message: 'Auction item not found' });

    // Check if the auction has closed
    if (auctionItem.isClosed) {
      return res.status(400).json({ message: 'Auction has closed' });
    }

    // Ensure bidAmount is a number
    const bid = parseFloat(bidAmount);
    if (isNaN(bid)) {
      return res.status(400).json({ message: 'Invalid bid amount' });
    }

    // Check if the bid is higher than the current highest bid
    if (bid <= auctionItem.highestBid) {
      return res.status(400).json({
        message: `Bid amount must be higher than the current bid of ${auctionItem.highestBid}`
      });
    }

    // Update the auction item with the new bid
    auctionItem.highestBid = bid;
    auctionItem.highestBidder = bidderName;

    // Check if auction time is over and automatically close it
    if (new Date() > new Date(auctionItem.auctionEndTime)) {
      auctionItem.isClosed = true;
    }

    // Save the updated auction item
    await auctionItem.save();
    res.status(200).json({
      message: 'Bid placed successfully',
      auctionItem: auctionItem
    });

  } catch (error) {
    res.status(500).json({ message: 'Error placing bid', error });
  }
});

// Get all auctions
app.get('/auctions', async (req, res) => {
  try {
    const auctions = await AuctionItem.find();
    res.status(200).json(auctions);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching auctions', error });
  }
});

// Get a single auction
app.get('/auctions/:id', async (req, res) => {
  const { id } = req.params;

  // Check if the provided ID is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid auction item ID' });
  }

  try {
    const auctionItem = await AuctionItem.findById(id);
    if (!auctionItem) return res.status(404).json({ message: 'Auction item not found' });

    res.status(200).json(auctionItem);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching auction', error });
  }
});

// Edit Auction (Update Auction Item)
app.put('/auction/:id', async (req, res) => {
  const { id } = req.params;
  const { title, description, startingBid, auctionEndTime } = req.body;

  // Check if the provided ID is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid auction item ID' });
  }

  try {
    const auctionItem = await AuctionItem.findById(id);
    if (!auctionItem) return res.status(404).json({ message: 'Auction item not found' });

    auctionItem.title = title || auctionItem.title;
    auctionItem.description = description || auctionItem.description;
    auctionItem.startingBid = startingBid || auctionItem.startingBid;
    auctionItem.auctionEndTime = auctionEndTime || auctionItem.auctionEndTime;

    await auctionItem.save();
    res.status(200).json({ message: 'Auction item updated successfully', auctionItem });
  } catch (error) {
    res.status(500).json({ message: 'Error updating auction', error });
  }
});

// Delete Auction Route
app.delete('/auction/:id', async (req, res) => {
  const { id } = req.params;

  // Check if the provided ID is a valid ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid auction item ID' });
  }

  try {
    const auctionItem = await AuctionItem.findById(id);
    if (!auctionItem) return res.status(404).json({ message: 'Auction item not found' });

    await auctionItem.remove();
    res.status(200).json({ message: 'Auction item deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting auction', error });
  }
});

// Start the server
const port = 5000;
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
