const express = require('express');
const mysql = require('mysql2/promise');
const app = express();
const PORT = 3000;

let db;

// Database connection config
const dbConfig = {
  host: 'localhost',
  user: 'root',
  password: 'Harvey03', // ← your MySQL password here
  database: 'DogWalkService'
};

// Insert test data on startup
async function insertTestData() {
  // ✅ Disable foreign key checks temporarily
  await db.query('SET FOREIGN_KEY_CHECKS = 0');

  // Clear all data (order doesn't matter with checks disabled)
  await db.query(`DELETE FROM WalkRatings`);
  await db.query(`DELETE FROM WalkApplications`);
  await db.query(`DELETE FROM WalkRequests`);
  await db.query(`DELETE FROM Dogs`);
  await db.query(`DELETE FROM Users`);

  // ✅ Insert users first
  await db.query(`
    INSERT INTO Users (username, email, password_hash, role) VALUES
    ('alice123', 'alice@example.com', 'hashed123', 'owner'),
    ('bobwalker', 'bob@example.com', 'hashed456', 'walker'),
    ('carol123', 'carol@example.com', 'hashed789', 'owner'),
    ('tompit', 'tp@example.com', 'hashed321', 'walker'),
    ('lachlan11', 'lac11@example.com', 'hashed654', 'owner')
  `);

  // Insert dogs (references owner_id)
  await db.query(`
    INSERT INTO Dogs (owner_id, name, size) VALUES
    ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Max', 'medium'),
    ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Bella', 'small'),
    ((SELECT user_id FROM Users WHERE username = 'lachlan11'), 'Harvey', 'medium'),
    ((SELECT user_id FROM Users WHERE username = 'alice123'), 'Ted', 'small'),
    ((SELECT user_id FROM Users WHERE username = 'carol123'), 'Buddy', 'medium');
  `);

  // Insert walk requests
  await db.query(`
    INSERT INTO WalkRequests (dog_id, requested_time, duration_minutes, location, status) VALUES
    ((SELECT dog_id FROM Dogs WHERE name = 'Max'), '2025-06-10 08:00:00', 30, 'Parklands', 'open'),
    ((SELECT dog_id FROM Dogs WHERE name = 'Bella'), '2025-06-10 09:30:00', 45, 'Beachside Ave', 'accepted'),
    ((SELECT dog_id FROM Dogs WHERE name = 'Harvey'), '2025-06-11 10:15:00', 60, 'Tusmore Park', 'open'),
    ((SELECT dog_id FROM Dogs WHERE name = 'Ted'), '2025-06-12 07:00:00', 25, 'Glenunga Oval', 'completed'),
    ((SELECT dog_id FROM Dogs WHERE name = 'Buddy'), '2025-06-13 11:45:00', 40, 'Adelaide Oval', 'cancelled')
  `);

  // Insert applications
  await db.query(`
    INSERT INTO WalkApplications (request_id, walker_id) VALUES
    ((SELECT request_id FROM WalkRequests WHERE location = 'Parklands'), (SELECT user_id FROM Users WHERE username = 'bobwalker')),
    ((SELECT request_id FROM WalkRequests WHERE location = 'Beachside Ave'), (SELECT user_id FROM Users WHERE username = 'tompit')),
    ((SELECT request_id FROM WalkRequests WHERE location = 'Tusmore Park'), (SELECT user_id FROM Users WHERE username = 'bobwalker'))
  `);


  // Insert rating
  await db.query(`
    INSERT INTO WalkRatings (request_id, walker_id, owner_id, rating, comments) VALUES
    (
      (SELECT request_id FROM WalkRequests WHERE location = 'Glenunga Oval'),
      (SELECT user_id FROM Users WHERE username = 'bobwalker'),
      (SELECT user_id FROM Users WHERE username = 'alice123'),
      5,
      'Great walk, thanks!'
    )
  `);

  // ✅ Re-enable foreign key checks
  await db.query('SET FOREIGN_KEY_CHECKS = 1');
}


// Connect to DB and start server
(async () => {
  try {
    db = await mysql.createConnection(dbConfig);
    await insertTestData();
    console.log('Test data inserted. Server is running.');

    app.listen(PORT, () =>
      console.log(`Server running at http://localhost:${PORT}`)
    );
  } catch (err) {
    console.error('Startup error:', err);
  }
})();

// /api/dogs
app.get('/api/dogs', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT d.name AS dog_name, d.size, u.username AS owner_username
      FROM Dogs d
      JOIN Users u ON d.owner_id = u.user_id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

// /api/walkrequests/open
app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT wr.request_id, d.name AS dog_name, wr.requested_time, wr.duration_minutes, wr.location, u.username AS owner_username
      FROM WalkRequests wr
      JOIN Dogs d ON wr.dog_id = d.dog_id
      JOIN Users u ON d.owner_id = u.user_id
      WHERE wr.status = 'open'
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch walk requests' });
  }
});

// /api/walkers/summary
app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT 
        u.username AS walker_username,
        COUNT(r.rating_id) AS total_ratings,
        ROUND(AVG(r.rating), 1) AS average_rating,
        COUNT(CASE WHEN wr.status = 'completed' THEN 1 END) AS completed_walks
      FROM Users u
      LEFT JOIN WalkRatings r ON u.user_id = r.walker_id
      LEFT JOIN WalkRequests wr ON r.request_id = wr.request_id
      WHERE u.role = 'walker'
      GROUP BY u.user_id
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch walker summary' });
  }
});
