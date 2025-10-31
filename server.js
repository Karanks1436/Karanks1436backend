require("dotenv").config();
const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const rateLimit = require("express-rate-limit");
const { body, validationResult } = require("express-validator");
const winston = require("winston");

const app = express();

// -------------------- ENV --------------------
const PORT = process.env.PORT || 5000;
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER;

const BULK_BATCH_SIZE = 40;
const BULK_CONCURRENCY = 5;
const SEND_RETRIES = 2;
const SEND_RETRY_DELAY_MS = 500;

if (!SMTP_USER || !SMTP_PASS) {
  console.error("ERROR: SMTP_USER and SMTP_PASS must be set.");
  process.exit(1);
}

// -------------------- LOGGER --------------------
const logger = winston.createLogger({
  level: "info",
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }),
    new winston.transports.File({ filename: "combined.log" }),
  ],
});

// -------------------- MIDDLEWARE --------------------
app.use(helmet());
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(morgan("tiny"));

app.use(
  rateLimit({
    windowMs: 60000,
    max: 200,
  })
);

// -------------------- SMTP TRANSPORTER --------------------
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: SMTP_USER, pass: SMTP_PASS },
  pool: true,
  maxConnections: 5,
  maxMessages: 1000,
});

transporter.verify((err) => {
  if (err) {
    logger.error("SMTP verify failed:", err);
  } else {
    logger.info("✅ SMTP ready");
  }
});

// -------------------- HELPERS --------------------
function sleep(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function sendWithRetries(options) {
  let lastErr;
  for (let attempt = 0; attempt <= SEND_RETRIES; attempt++) {
    try {
      return await transporter.sendMail(options);
    } catch (err) {
      lastErr = err;
      await sleep(SEND_RETRY_DELAY_MS * (attempt + 1));
    }
  }
  throw lastErr;
}

// ✅ CUSTOM CONCURRENCY LIMITER
function createLimiter(concurrency) {
  let running = 0;
  const queue = [];

  const run = () => {
    if (running >= concurrency || queue.length === 0) return;

    const task = queue.shift();
    running++;

    task
      .fn()
      .then(task.resolve)
      .catch(task.reject)
      .finally(() => {
        running--;
        run();
      });
  };

  return function limit(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      run();
    });
  };
}

// -------------------- ROUTES --------------------

// ✅ HEALTH CHECK
app.get("/health", (req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// ✅ LOGIN EMAIL
app.post(
  "/send-login-email",
  [body("name").isString(), body("email").isEmail()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name, email } = req.body;

    const html = `
      <h2>Hello ${name}</h2>
      <p>You logged in at ${new Date().toLocaleString()}</p>
    `;

    try {
      const info = await sendWithRetries({
        from: `"Karanks1436" <${SMTP_USER}>`,
        to: email,
        subject: `Welcome back, ${name}!`,
        html,
      });

      return res.json({ success: true, messageId: info.messageId });
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to send login email" });
    }
  }
);

// ✅ CONTACT MESSAGE
app.post(
  "/send-contact-message",
  [body("name").isString(), body("email").isEmail(), body("message").isString()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { name, email, message } = req.body;

    try {
      const info = await sendWithRetries({
        from: `"Contact Form" <${SMTP_USER}>`,
        to: ADMIN_EMAIL,
        replyTo: email,
        subject: `📨 New Contact Message from ${name}`,
        html: `<h3>${name}</h3><p>${email}</p><p>${message}</p>`,
      });

      return res.json({ success: true, messageId: info.messageId });
    } catch (err) {
      return res
        .status(500)
        .json({ success: false, error: "Failed to send contact message" });
    }
  }
);

// ✅ BULK EMAIL
app.post(
  "/send-bulk-email",
  [
    body("emails").isArray({ min: 1 }).withMessage("Emails must be an array"),
    body("emails.*").isEmail().withMessage("Invalid email"),
    body("message").optional({ checkFalsy: true }).isString(),
    body("subject").optional({ checkFalsy: true }).isString(),
    body("fileUrl").optional({ checkFalsy: true }).isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const {
      emails,
      message = "",
      subject = "🔔 Notification from Admin", // ✅ default to avoid frontend changes
      fileUrl = "",
    } = req.body;

    const limit = createLimiter(BULK_CONCURRENCY);
    const results = [];

    for (const email of emails) {
      results.push(
        limit(async () => {
          try {
            const html = `
              <div>
                <h3>🔔 Notification</h3>
                <p>${message}</p>
                ${
                  fileUrl
                    ? `<p><a href="${fileUrl}" target="_blank">Attached File</a></p>`
                    : ""
                }
              </div>
            `;

            const info = await sendWithRetries({
              from: `"Karanks1436" <${SMTP_USER}>`,
              to: email,
              subject,
              html,
            });

            return { email, success: true, id: info.messageId };
          } catch (err) {
            return { email, success: false, error: err.message };
          }
        })
      );
    }

    const settled = await Promise.all(results);

    return res.json({
      success: true,
      sent: settled.filter((r) => r.success).length,
      failed: settled.filter((r) => !r.success),
    });
  }
);

// -------------------- START SERVER --------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});


// require("dotenv").config();
// const express = require("express");
// const nodemailer = require("nodemailer");
// const fs = require("fs");
// const path = require("path");
// const cors = require("cors");
// const helmet = require("helmet");
// const morgan = require("morgan");
// const rateLimit = require("express-rate-limit");
// const { body, validationResult } = require("express-validator");
// const winston = require("winston");

// const app = express();

// // -------------------- ENV --------------------
// const PORT = process.env.PORT || 5000;
// const SMTP_USER = process.env.SMTP_USER;
// const SMTP_PASS = process.env.SMTP_PASS;
// const ADMIN_EMAIL = process.env.ADMIN_EMAIL || SMTP_USER;

// const BULK_BATCH_SIZE = 40;
// const BULK_CONCURRENCY = 5;
// const SEND_RETRIES = 2;
// const SEND_RETRY_DELAY_MS = 500;

// if (!SMTP_USER || !SMTP_PASS) {
//   console.error("ERROR: SMTP_USER and SMTP_PASS must be set.");
//   process.exit(1);
// }

// // -------------------- LOGGER --------------------
// const logger = winston.createLogger({
//   level: "info",
//   transports: [
//     new winston.transports.Console({ format: winston.format.simple() }),
//     new winston.transports.File({ filename: "combined.log" }),
//   ],
// });

// // -------------------- MIDDLEWARE --------------------
// app.use(helmet());
// app.use(cors());
// app.use(express.json({ limit: "1mb" }));
// app.use(morgan("tiny"));

// // RATE LIMIT
// app.use(
//   rateLimit({
//     windowMs: 60000,
//     max: 60,
//   })
// );

// // -------------------- SMTP TRANSPORTER --------------------
// const transporter = nodemailer.createTransport({
//   host: "smtp.gmail.com",
//   port: 465,
//   secure: true,
//   auth: { user: SMTP_USER, pass: SMTP_PASS },
//   pool: true,
//   maxConnections: 5,
//   maxMessages: 1000,
// });

// transporter.verify((err) => {
//   if (err) {
//     logger.error("SMTP verify failed:", err);
//   } else {
//     logger.info("✅ SMTP ready");
//   }
// });

// // -------------------- HELPERS --------------------
// function loadTemplate(name) {
//   try {
//     return fs.readFileSync(path.join(__dirname, "templates", name), "utf8");
//   } catch (err) {
//     return null;
//   }
// }

// function sleep(ms) {
//   return new Promise((res) => setTimeout(res, ms));
// }

// // Retry mail sending
// async function sendWithRetries(options) {
//   let lastErr;
//   for (let attempt = 0; attempt <= SEND_RETRIES; attempt++) {
//     try {
//       return await transporter.sendMail(options);
//     } catch (err) {
//       lastErr = err;
//       await sleep(SEND_RETRY_DELAY_MS * (attempt + 1));
//     }
//   }
//   throw lastErr;
// }

// // ✅ CUSTOM CONCURRENCY LIMITER (Better than p-limit)
// function createLimiter(concurrency) {
//   let running = 0;
//   const queue = [];

//   const run = () => {
//     if (running >= concurrency || queue.length === 0) return;

//     const item = queue.shift();
//     running++;

//     item
//       .fn()
//       .then(item.resolve)
//       .catch(item.reject)
//       .finally(() => {
//         running--;
//         run();
//       });
//   };

//   return function limit(fn) {
//     return new Promise((resolve, reject) => {
//       queue.push({ fn, resolve, reject });
//       run();
//     });
//   };
// }

// // -------------------- ROUTES --------------------

// // ✅ HEALTH CHECK
// app.get("/health", (req, res) =>
//   res.json({ status: "ok", time: new Date().toISOString() })
// );

// // ✅ LOGIN EMAIL
// app.post(
//   "/send-login-email",
//   [body("name").isString(), body("email").isEmail()],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty())
//       return res.status(400).json({ errors: errors.array() });

//     const { name, email } = req.body;

//     try {
//       let html = loadTemplate("loginTemplate.html");
//       if (html) {
//         html = html
//           .replace(/{{user_name}}/g, name)
//           .replace(/{{login_time}}/g, new Date().toLocaleString());
//       } else {
//         html = `<p>Hello ${name}, login at ${new Date().toLocaleString()}</p>`;
//       }

//       const info = await sendWithRetries({
//         from: `"Karanks1436" <${SMTP_USER}>`,
//         to: email,
//         subject: `Welcome back, ${name}!`,
//         html,
//       });

//       return res.json({ success: true, messageId: info.messageId });
//     } catch (err) {
//       return res
//         .status(500)
//         .json({ success: false, error: "Failed to send login email" });
//     }
//   }
// );

// // ✅ CONTACT MESSAGE
// app.post(
//   "/send-contact-message",
//   [body("name").isString(), body("email").isEmail(), body("message").isString()],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty())
//       return res.status(400).json({ errors: errors.array() });

//     const { name, email, message } = req.body;

//     try {
//       const info = await sendWithRetries({
//         from: `"Contact Form" <${SMTP_USER}>`,
//         to: ADMIN_EMAIL,
//         replyTo: email,
//         subject: `📨 New Contact Message from ${name}`,
//         html: `
//           <h2>New Message</h2>
//           <p><b>Name:</b> ${name}</p>
//           <p><b>Email:</b> ${email}</p>
//           <p>${message}</p>
//         `,
//       });

//       return res.json({ success: true, messageId: info.messageId });
//     } catch (err) {
//       return res
//         .status(500)
//         .json({ success: false, error: "Failed to send contact message" });
//     }
//   }
// );

// // ✅ BULK EMAIL
// app.post(
//   "/send-bulk-email",
//   [
//     body("emails").isArray({ min: 1 }),
//     body("emails.*").isEmail(),
//     body("message").optional().isString(),
//     body("subject").optional().isString(),
//     body("fileUrl").optional().isString(),
//   ],
//   async (req, res) => {
//     const errors = validationResult(req);
//     if (!errors.isEmpty())
//       return res.status(400).json({ errors: errors.array() });

//     const { emails, message = "", subject = "🔔 Notification", fileUrl } =
//       req.body;

//     const limit = createLimiter(BULK_CONCURRENCY);
//     const batches = [];

//     for (let i = 0; i < emails.length; i += BULK_BATCH_SIZE) {
//       batches.push(emails.slice(i, i + BULK_BATCH_SIZE));
//     }

//     const results = [];

//     for (const batch of batches) {
//       const promises = batch.map((to) =>
//         limit(async () => {
//           try {
//             const html = `
//               <h3>🔔 Notification</h3>
//               <p>${message}</p>
//               ${
//                 fileUrl
//                   ? `<p><a href="${fileUrl}" target="_blank">Attached File</a></p>`
//                   : ""
//               }
//             `;

//             const info = await sendWithRetries({
//               from: `"Karanks1436" <${SMTP_USER}>`,
//               to,
//               subject,
//               html,
//             });

//             return { to, success: true, messageId: info.messageId };
//           } catch (err) {
//             return { to, success: false, error: err.message };
//           }
//         })
//       );

//       const settled = await Promise.all(promises);
//       results.push(...settled);
//       await sleep(400);
//     }

//     const failed = results.filter((r) => !r.success);

//     return res.json({
//       success: failed.length === 0,
//       sent: results.length - failed.length,
//       failed: failed.length,
//       details: failed,
//     });
//   }
// );

// // -------------------- START SERVER --------------------
// app.listen(PORT, () => {
//   console.log(`✅ Server running on port ${PORT}`);
// });






// // const express = require("express");
// // const nodemailer = require("nodemailer");
// // const fs = require("fs");
// // const path = require("path");
// // const cors = require("cors");

// // const app = express(); 
// // app.use(cors());
// // app.use(express.json());

// // app.post("/send-login-email", async (req, res) => {
// //   const { name, email } = req.body;

// //   // Load your HTML template
// //   const templatePath = path.join(__dirname, "templates", "loginTemplate.html");
// //   let htmlTemplate = fs.readFileSync(templatePath, "utf-8");

// //   // Replace placeholders
// //   htmlTemplate = htmlTemplate
// //     .replace(/{{user_name}}/g, name)
// //     .replace(/{{login_time}}/g, new Date().toLocaleString());

// //   const transporter = nodemailer.createTransport({
// //     service: "gmail",
// //     auth: {
// //       user: "karanksxxx@gmail.com",
// //       pass: "vqla xjtv arnf ulpf",
// //     },
// //   });

// //   const mailOptions = {
// //     from: '"KARANKS1436 👾" <karanksxxx@gmail.com>',
// //     to: email,
// //     subject: `Welcome back, ${name}!`,
// //     html: htmlTemplate,
// //   };

// //   try {
// //     await transporter.sendMail(mailOptions);
// //     res.status(200).json({ message: "Email sent successfully!" });
// //   } catch (error) {
// //     console.error("Nodemailer error:", error);
// //     res.status(500).json({ error: "Failed to send email." });
// //   }
// // });


// // app.post("/send-bulk-email", async (req, res) => {
// //   const { emails, message, fileUrl } = req.body;

// //   const transporter = nodemailer.createTransport({
// //     service: "gmail",
// //     auth: {
// //       user: "karanksxxx@gmail.com",
// //       pass: "vqla xjtv arnf ulpf", 
// //     },
// //   });

// //   try {
// //     await Promise.all(
// //       emails.map((to_email) => {
// //         const html = `
// //         <div style="max-width: 640px; margin: auto; font-family: 'Segoe UI', Roboto, sans-serif; background: linear-gradient(145deg, #1f1f22, #141416); color: #eaeaea; border-radius: 16px; padding: 28px; box-shadow: 0 0 20px rgba(0, 229, 255, 0.2); border: 1px solid #2b2b2e;">
// //           <header style="text-align: center; border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 30px;">
// //             <h2 style="color: #00e5ff; margin: 0; font-size: 26px;">🚀 Karanks1436 Notification</h2>
// //             <p style="color: #aaa; font-size: 15px; margin-top: 8px;">You are receiving this as a valued member of <strong>Karanks1436</strong>.</p>
// //           </header>

// //           <section style="margin-bottom: 32px;">
// //             <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📝 Message:</h3>
// //             <div style="background: #262628; padding: 18px 20px; border-left: 4px solid #00e5ff; border-radius: 10px; font-size: 16px; color: #f1f1f1; line-height: 1.6;">
// //               ${message || "No message provided."}
// //             </div>
// //           </section>

// //           ${fileUrl ? `
// //             <section style="margin-bottom: 32px;">
// //               <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📎 Attached File / Image:</h3>
// //               <a href="${fileUrl}" target="_blank" style="display: inline-block; color: #4fc3f7; font-size: 15px; word-break: break-all; margin-bottom: 12px;">🔗 ${fileUrl}</a>
// //               <div style="margin-top: 16px; text-align: center;">
// //                 <img src="${fileUrl}" alt="Attachment" style="max-width: 100%; border-radius: 12px; box-shadow: 0 0 12px rgba(0,0,0,0.4);" />
// //               </div>
// //             </section>
// //           ` : ""}

// //           <footer style="border-top: 1px solid #333; padding-top: 20px; text-align: center; font-size: 13px; color: #888;">
// //             <p>This notification was sent via the <strong>Karanks1436 Admin Panel</strong>.</p>
// //             <p>© 2025 Karanks1436 • All rights reserved.</p>
// //           </footer>
// //         </div>
// //         `;

// //         return transporter.sendMail({
// //           from: '"Karanks1436 👾" <karanksxxx@gmail.com>',
// //           to: to_email,
// //           subject: "🔔 Notification from Admin",
// //           html,
// //         });
// //       })
// //     );

// //     res.status(200).send({ success: true, message: "Emails sent!" });
// //   } catch (err) {
// //     console.error("Send error:", err);
// //     res.status(500).send({ success: false, message: "Failed to send emails" });
// //   }
// // });
// // // ------------------------------
// // // 📧 Contact Form Email Endpoint
// // // ------------------------------
// // app.post("/send-contact-message", async (req, res) => {
// //   const { name, email, message } = req.body;

// //   const transporter = nodemailer.createTransport({
// //     service: "gmail",
// //     auth: {
// //       user: "karanksxxx@gmail.com",
// //       pass: "vqla xjtv arnf ulpf", // App password
// //     },
// //   });

// //   if (!name || !email || !message) {
// //     return res.status(400).json({ error: "All fields are required." });
// //   }

// //   const mailOptions = {
// //     from: `"KaranKS1436 Contact Form" <karanksxxx@gmail.com>`,
// //     to: "karanksxxx@gmail.com",
// //     replyTo: email, // 👈 This makes replies go to the user's address
// //     subject: `📨 New Contact Message from ${name}`,
// //     html: `
// //       <div style="font-family: Arial, sans-serif; background: #111; color: #fff; padding: 20px; border-radius: 8px;">
// //         <h2 style="color: #00e5ff;">New Contact Form Message</h2>
// //         <p><strong>Name:</strong> ${name}</p>
// //         <p><strong>Email:</strong> ${email}</p>
// //         <hr style="border-color: #333;" />
// //         <p style="margin-top: 16px;"><strong>Message:</strong></p>
// //         <div style="background: #1c1c1c; padding: 12px; border-radius: 6px; color: #ddd;">${message}</div>
// //         <p style="margin-top: 24px; font-size: 12px; color: #666;">Sent on: ${new Date().toLocaleString()}</p>
// //       </div>
// //     `,
// //   };

// //   try {
// //     await transporter.sendMail(mailOptions);
// //     res.status(200).json({ success: true, message: "Message sent!" });
// //   } catch (err) {
// //     console.error("Contact message error:", err);
// //     res.status(500).json({ success: false, message: "Failed to send contact message." });
// //   }
// // });
// // const PORT = 5000;
// // app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
