// import and instantiate express
const express = require("express"); // CommonJS import style!
const app = express(); // instantiate an Express object
const cors = require("cors");
const axios = require("axios");
const dotenv = require("dotenv").config();
const mongoose = require("mongoose");
const User = require("./models/User.js")
app.use(cors());
app.use(express.json());

// the following are used for authentication with JSON Web Tokens
const jwt = require("jsonwebtoken")
const passport = require("passport")

// use this JWT strategy within passport for authentication handling
const jwtStrategy = require("./config/jwt-config.js") // import setup options for using JWT in passport
passport.use(jwtStrategy)

app.use(passport.initialize())

// connect to the database
// console.log(`Conneting to MongoDB at ${process.env.MONGODB_URI}`)
try {
    mongoose.connect(process.env.MONGODB_URI)
    console.log(`Connected to MongoDB.`)
  } catch (err) {
    console.log(
      `Error connecting to MongoDB Atlas: ${err}`
    )
  }

const authenticationRoutes = require("./routes/user-authentication.js")
const protectedRoutes = require("./routes/protected-content-routes.js")

app.use("/api", authenticationRoutes())
app.use("/api/protected", protectedRoutes())

app.get("/api/news", (req, res, next) => {
  const options = {
    method: "GET",
    url: "https://cryptocurrency-news2.p.rapidapi.com/v1/coindesk",
    headers: {
      "X-RapidAPI-Key": "31fd1e50c7msh80e380145cecaaap1403b6jsn6eeeb915efcc",
      "X-RapidAPI-Host": "cryptocurrency-news2.p.rapidapi.com",
    },
  };

  axios
    .request(options)
    .then((apiResponse) => res.json(apiResponse.data))
    .catch((err) => next(err));
});

// Portfolio Routes

// get portfolio data from the database or wherever it's stored this is just temporary
const portfoliosData = [
  // more portfolios will be added
];

// function to get the current Bitcoin price in USD
async function getCurrentBitcoinPrice() {
  try {
    const response = await axios.get(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd"
    );
    return response.data.bitcoin.usd;
  } catch (error) {
    console.error("Error fetching Bitcoin price:", error);
    return null;
  }
}

app.get("/api/portfolios", async (req, res) => {
  try {
    const bitcoinPriceUSD = await getCurrentBitcoinPrice();
    if (!bitcoinPriceUSD) {
      throw new Error("Failed to fetch Bitcoin price");
    }

    const updatedPortfolios = await Promise.all(
      portfoliosData.map(async (portfolio) => {
        let { platformId, address } = portfolio;

        if (platformId !== "bitcoin") {
          return portfolio; // skip non-Bitcoin portfolios for now we can add ETH ADA and others here later
        }

        // get the balance from the Mempool API
        const url = `https://mempool.space/api/address/${address}`;
        const response = await axios.get(url);
        const { chain_stats, mempool_stats } = response.data;

        let confirmedBalance =
          chain_stats.funded_txo_sum - chain_stats.spent_txo_sum;
        let unconfirmedBalance =
          mempool_stats.funded_txo_sum - mempool_stats.spent_txo_sum;
        let totalBalanceSatoshis = confirmedBalance + unconfirmedBalance;
        let totalBalanceBTC = totalBalanceSatoshis / 100000000; // convert satoshis to Bitcoin

        let balanceUSD = totalBalanceBTC * bitcoinPriceUSD;

        // return the portfolio with the balance in USD
        return { ...portfolio, balance: `$${balanceUSD.toFixed(2)}` };
      })
    );

    res.json(updatedPortfolios);
  } catch (error) {
    console.error("Error fetching portfolio data with balance:", error);
    res
      .status(500)
      .json({ message: "Error fetching portfolio data with balance" });
  }
});

app.post("/api/addWallet", async (req, res) => {
  const { name, address, balance } = req.body;

  // make a new portfolio object
  const newPortfolio = {
    id: `portfolio-${portfoliosData.length + 1}`, // ID generation we can change later when we integrate database
    name,
    platformId: "bitcoin",
    address,
    balance,
  };

  portfoliosData.push(newPortfolio);

  res.json({
    portfolios: portfoliosData,
    message: `Address ${address} received and processed.`,
  });
});

app.delete("/api/deleteWallet/:id", async (req, res) => {
  const { id } = req.params;
  const index = portfoliosData.findIndex(p => p.id === id); // TODO: will need to be changed for MongoDB
  if (index !== -1) {
    portfoliosData.splice(index, 1); // removes the portfolio from the array
    res.json({ message: `Wallet with ID ${id} deleted.` });
  } else {
    res.status(404).json({ message: `Wallet with ID ${id} not found.` });
  }
});

//For CryptoList API - Route handler for GET requests to the '/api/coins' endpoint

app.get("/api/coins", async (req, res) => {
  const { page } = req.query;
  const offset = (page - 1) * 100; // CoinCap uses offset, not skip

    try {
        // Calls URL to fetch data from the CoinCap API
        const url = `https://api.coincap.io/v2/assets?limit=100&offset=${offset}`;
        const response = await axios.get(url);
        const data = response.data.data.map(coin => ({
            id: coin.id,
            name: coin.name,
            priceUsd: parseFloat(coin.priceUsd).toFixed(2), // Format for simplicity
        }));
        res.json(data);
    } catch (error) {
        // Error checking
        console.error('Error fetching coin data:', error);
        res.status(500).send('Error fetching coin data');
    }
});

module.exports = app;
