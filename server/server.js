const express = require('express');
const mysql = require('mysql');
const cors = require('cors');
const bodyparser = require("body-parser");
const stripe = require('stripe')('sk_test_51MvRJOJPzEM2NGfO4UQxhJH46Fjtldv6TmPGqP59DeAuvGaI08EPoUNXMQgUBdIlA1tgCQud8MRkJ12besbpequ400UwOOJVp6');
const bcrypt = require('bcryptjs'); // Add bcrypt for password hashing
const { check, validationResult } = require('express-validator');

const app = express();
app.use(express.static('public'));
app.use(cors({ origin: true, credentials: true }));
app.use(bodyparser.urlencoded({ extended: false }));
app.use(bodyparser.json());

class Params {
  constructor(cantidad, id) {
    this.cantidad = cantidad;
    this.id = id;
  }
}



// Create a MySQL connection pool
const pool = mysql.createPool({
  connectionLimit: 100,
  host: '192.168.0.1',
  port: 3306,
  user: 'oscar',
  password: 'shugu2190!',
  database: 'energamer'
});

/*pool.getConnection((err,connection) => {
    if (err) {
        // If there's an error acquiring a connection, send an error response
        console.log('Error acquiring MySQL connection');
        console.log(err);

      } else {
        console.log('Conexion establecida')
      }
});
*/
// Define a route for handling GET requests to '/users'
app.get('/productos', (req, res) => {
  // Acquire a connection from the pool
  pool.getConnection((err, connection) => {
    if (err) {
      // If there's an error acquiring a connection, send an error response
      res.status(500).send('Error acquiring MySQL connection');
    } else {
      // Use the connection to execute a SELECT query
      connection.query('SELECT * FROM productos', (err, results) => {
        // Release the connection back to the pool
        connection.release();

        if (err) {
          // If there's an error executing the query, send an error response
          res.status(500).send('Error executing MySQL query');
        } else {
          // If the query was successful, send the results as JSON
          res.json(results);
        }
      });
    }
  });
});

app.post('/create-checkout-session', async (req, res) => {
  req.body.items.map((item) => {
    Params.cantidad = item.quantity;
    Params.id = item.id;
  });
  const session = await stripe.checkout.sessions.create({
    payment_method_options: {
      card: {
        installments: {
          enabled: true,
        },
      },
    },
    shipping_address_collection: {
      allowed_countries: ['MX'],
    },
    shipping_options: [
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {
            amount: 0,
            currency: 'mxn',
          },
          display_name: 'Free shipping',
          // Delivers between 5-7 business days
          delivery_estimate: {
            minimum: {
              unit: 'business_day',
              value: 5,
            },
            maximum: {
              unit: 'business_day',
              value: 7,
            },
          }
        }
      },
      {
        shipping_rate_data: {
          type: 'fixed_amount',
          fixed_amount: {
            amount: 1500,
            currency: 'mxn',
          },
          display_name: 'Next day air',
          // Delivers in exactly 1 business day
          delivery_estimate: {
            minimum: {
              unit: 'business_day',
              value: 1,
            },
            maximum: {
              unit: 'business_day',
              value: 1,
            },
          }
        }
      },
    ],
    line_items: req.body.items.map((item) => ({
      price_data: {
        currency: 'mxn',
        product_data: {
          name: item.name,
          images: [item.image]
        },
        unit_amount: item.price * 100,
      },
      quantity: item.quantity,
    })),
    mode: 'payment',
    success_url: "http://localhost:3000/success.html",
    cancel_url: "http://localhost:3000/cancel.html",

  });
  res.json({ id: session.id });

});

app.get('/updateQ', (req, res) => {
  console.log('entro query');
  pool.getConnection((err, connection) => {
    if (err) {
      // If there's an error acquiring a connection, send an error response
      res.status(500).send('Error acquiring MySQL connection');
    } else {
      const id = Params.id;
      const newQuantity = Params.cantidad;
      console.log(id, newQuantity);
      const sql = 'UPDATE productos SET cantidad = cantidad - ? WHERE id = ?';
      const values = [newQuantity, id];
      connection.query(sql, values, (error, res) => {
        if (error) {
          console.error('Error updating the table: ', error);
          res.status(500).send('Error updating the table.');
          connection.release();

        } else {
          console.log('Table updated successfully.');
          connection.release();

        }
      });
    }
  });
});

// Register API endpoint
app.post('/register', [
  check('username').isAlphanumeric().withMessage('Invalid username'),
  check('email').isEmail().withMessage('Invalid email'),
  check('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long')
], (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  const { username, email, password } = req.body;

  // Hash password
  const hashedPassword = bcrypt.hashSync(password, 10);

  pool.getConnection((err, connection) => {
    if (err) {
      // If there's an error acquiring a connection, send an error response
      res.status(500).send('Error acquiring MySQL connection');
    } else {
      const checkDuplicateQuery = `
    SELECT COUNT(*) as count FROM users WHERE username = ? OR email = ?;
  `;
      connection.query(checkDuplicateQuery, [username, email], (err, results) => {
        if (err) {
          console.error(err);
          connection.release();

          return res.status(500).json({ message: 'Internal server error' });

        }
        const count = results[0].count;
        if (count > 0) {
          connection.release();

          return res.status(400).json({ message: 'Usuario o Correo ya existen' });
        }
        const query = `INSERT INTO users (username, email, pass_word) VALUES (?, ?, ?)`;
        connection.query(query, [username, email, hashedPassword], (err, results) => {
          if (err) throw err;

          res.json({ success: true });


        });
      });
    }
    // Store user in MySQL

  })

});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  pool.getConnection((err, connection) => {
    if (err) {
      // If there's an error acquiring a connection, send an error response
      res.status(500).send('Error acquiring MySQL connection');
    } else {
  connection.query('SELECT * FROM users WHERE username = ?', [username], async (error, results) => {
    if (error) {
      console.error('Error querying database: ', error);
      res.status(500).json({ message: 'Internal server error' });
      return;
    }

    if (results.length === 0) {
      res.status(401).json({ message: 'User not found' });
      return;
    }

    const user = results[0];

    const match = await bcrypt.compare(password, user.pass_word);

    if (!match) {
      res.status(401).json({ message: 'Incorrect password' });
      return;
    }

    // authentication successful
    res.json({ user: { username: user.username }});

  });
    }});

});

// Start the server
app.listen(3000, () => {
  console.log('Server started on port 3000');
});

