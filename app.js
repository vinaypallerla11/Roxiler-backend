const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();
// const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to SQLite database
const db = new sqlite3.Database('./database.db');

// Drop existing ProductTransaction table (if any)
db.run(`DROP TABLE IF EXISTS ProductTransaction`);

// Create ProductTransaction table with the category column
db.run(`
  CREATE TABLE IF NOT EXISTS ProductTransaction (
    id INTEGER PRIMARY KEY,
    title TEXT,
    description TEXT,
    price REAL,
    dateOfSale TEXT,
    category TEXT
  )
`, (error) => {
  if (error) {
    console.error('Error creating table:', error);
  } else {
    console.log('Table created successfully');
  }
});


// API to initialize the database with seed data
app.get('/initialize-database', async (req, res) => {
  try {
    const response = await fetch('https://s3.amazonaws.com/roxiler.com/product_transaction.json');
    
    if (!response.ok) {
      throw new Error(`Failed to fetch seed data: ${response.statusText}`);
    }

    const seedData = await response.json();
    // console.log(seedData)

    seedData.forEach(({ title, description, price, dateOfSale, category }) => {
      db.run(
        'INSERT INTO ProductTransaction (title, description, price, dateOfSale, category) VALUES (?, ?, ?, ?, ?)',
        [title, description, price, dateOfSale, category]
      );
    });

    res.status(200).json({ message: seedData});
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});
// http://localhost:3000/initialize-database

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});



app.get('/list-transactions', async (req, res) => {
    try {
      const { page = 1, perPage = 10, search = '' } = req.query;
  
      const query = `
        SELECT * FROM ProductTransaction
        WHERE title LIKE '%${search}%' OR description LIKE '%${search}%' OR price LIKE '%${search}%' OR category LIKE '%${search}%'
        LIMIT ${perPage} OFFSET ${(page - 1) * perPage}
      `;
  
      db.all(query, (err, transactions) => {
        if (err) throw err;
        res.status(200).json(transactions);
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});

// http://localhost:3000/list-transactions?search=
// http://localhost:3000/list-transactions?search= Fjallraven  Foldsack No 1 Backpack Fits 15 Laptops

app.get('/statistics', async (req, res) => {
    try {
      const { month } = req.query;
  
      const startOfMonth = `${month}-01`;
      const endOfMonth = `${month}-31`;
  
      const totalSaleAmountQuery = `SELECT SUM(price) as totalAmount FROM ProductTransaction WHERE dateOfSale BETWEEN '${startOfMonth}' AND '${endOfMonth}'`;
      const totalSoldItemsQuery = `SELECT COUNT(*) as totalCount FROM ProductTransaction WHERE dateOfSale BETWEEN '${startOfMonth}' AND '${endOfMonth}'`;
      const totalNotSoldItemsQuery = 'SELECT COUNT(*) as totalCount FROM ProductTransaction WHERE dateOfSale IS NULL';
  
      const [totalSaleAmountResult, totalSoldItemsResult, totalNotSoldItemsResult] = await Promise.all([
        new Promise((resolve) => db.get(totalSaleAmountQuery, (err, row) => resolve(row))),
        new Promise((resolve) => db.get(totalSoldItemsQuery, (err, row) => resolve(row))),
        new Promise((resolve) => db.get(totalNotSoldItemsQuery, (err, row) => resolve(row))),
      ]);
  
      res.status(200).json({
        totalSaleAmount: totalSaleAmountResult.totalAmount || 0,
        totalSoldItems: totalSoldItemsResult.totalCount || 0,
        totalNotSoldItems: totalNotSoldItemsResult.totalCount || 0,
      });
    } catch (error) {
      console.error(error);
      res.status(500).json({ error: 'Internal Server Error' });
    }
});

// http://localhost:3000/statistics?month=2021-12
  
app.get('/price-range-chart', async (req, res) => {
  try {
    const { month } = req.query;
    const startOfMonth = `${month}-01`;
    const endOfMonth = `${month}-31`;

    const priceRanges = [
      { min: 0, max: 100 },
      { min: 101, max: 200 },
      { min: 201, max: 300 },
      { min: 301, max: 400 },
      { min: 401, max: 500 },
      { min: 501, max: 600 },
      { min: 601, max: 700 },
      { min: 701, max: 800 },
      { min: 801, max: 900 },
      { min: 901, max: Number.MAX_SAFE_INTEGER }, // Consider adjusting the upper limit accordingly
    ];

    const priceRangeQueries = priceRanges.map(({ min, max }) => `
      SELECT COALESCE(COUNT(*), 0) as count
      FROM ProductTransaction
      WHERE dateOfSale BETWEEN ? AND ?
      AND price >= ${min} AND price <= ${max}
    `);

    const countsByPriceRange = await Promise.all(
      priceRangeQueries.map((query) => db.get(query, [startOfMonth, endOfMonth]))
    );

    const result = priceRanges.map(({ min, max }, index) => ({
      priceRange: `${min}-${max === Number.MAX_SAFE_INTEGER ? 'above' : max}`,
      itemCount: countsByPriceRange[index].count,
    }));

    res.status(200).json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// http://localhost:3000/price-range-chart?month=2021-01


app.get('/pie-chart', async (req, res) => {
  try {
    const { month } = req.query;
    const startOfMonth = `${month}-01`;
    const endOfMonth = `${month}-31`;

    const uniqueCategoriesQuery = `SELECT category, COUNT(*) as itemCount FROM ProductTransaction WHERE dateOfSale BETWEEN ? AND ? AND category IS NOT NULL GROUP BY category`;

    const uniqueCategories = await new Promise((resolve, reject) => {
      db.all(uniqueCategoriesQuery, [startOfMonth, endOfMonth], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.status(200).json(uniqueCategories);
    console.log(uniqueCategoriesQuery)
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

