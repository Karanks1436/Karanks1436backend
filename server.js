const express = require("express");
const nodemailer = require("nodemailer");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const { google } = require("googleapis");

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------
// 🔑 Gmail OAuth2 Configuration
// ---------------------------------------
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REDIRECT_URI = "https://developers.google.com/oauthplayground";
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// 🧩 Helper function to create transporter
async function createTransporter() {
  const accessToken = await oAuth2Client.getAccessToken();

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: "karanksxxx@gmail.com", // your Gmail address
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
      accessToken: accessToken.token,
    },
  });
}

// ---------------------------------------
// 📩 1️⃣ Send Login Email
// ---------------------------------------
app.post("/send-login-email", async (req, res) => {
  const { name, email } = req.body;

  try {
    const transporter = await createTransporter();

    // Load HTML template
    const templatePath = path.join(__dirname, "templates", "loginTemplate.html");
    let htmlTemplate = fs.readFileSync(templatePath, "utf-8");

    // Replace placeholders
    htmlTemplate = htmlTemplate
      .replace(/{{user_name}}/g, name)
      .replace(/{{login_time}}/g, new Date().toLocaleString());

    const mailOptions = {
      from: '"KARANKS1436 👾" <karanksxxx@gmail.com>',
      to: email,
      subject: `Welcome back, ${name}!`,
      html: htmlTemplate,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: "Email sent successfully!" });
  } catch (error) {
    console.error("OAuth2 Login Email Error:", error);
    res.status(500).json({ error: "Failed to send login email." });
  }
});

// ---------------------------------------
// 📤 2️⃣ Send Bulk Emails
// ---------------------------------------
app.post("/send-bulk-email", async (req, res) => {
  const { emails, message, fileUrl } = req.body;

  try {
    const transporter = await createTransporter();

    await Promise.all(
      emails.map((to_email) => {
        const html = `
        <div style="max-width: 640px; margin: auto; font-family: 'Segoe UI', Roboto, sans-serif; background: linear-gradient(145deg, #1f1f22, #141416); color: #eaeaea; border-radius: 16px; padding: 28px; box-shadow: 0 0 20px rgba(0, 229, 255, 0.2); border: 1px solid #2b2b2e;">
          <header style="text-align: center; border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 30px;">
            <h2 style="color: #00e5ff; margin: 0; font-size: 26px;">🚀 Karanks1436 Notification</h2>
            <p style="color: #aaa; font-size: 15px; margin-top: 8px;">You are receiving this as a valued member of <strong>Karanks1436</strong>.</p>
          </header>

          <section style="margin-bottom: 32px;">
            <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📝 Message:</h3>
            <div style="background: #262628; padding: 18px 20px; border-left: 4px solid #00e5ff; border-radius: 10px; font-size: 16px; color: #f1f1f1; line-height: 1.6;">
              ${message || "No message provided."}
            </div>
          </section>

          ${fileUrl ? `
            <section style="margin-bottom: 32px;">
              <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📎 Attached File / Image:</h3>
              <a href="${fileUrl}" target="_blank" style="display: inline-block; color: #4fc3f7; font-size: 15px; word-break: break-all; margin-bottom: 12px;">🔗 ${fileUrl}</a>
              <div style="margin-top: 16px; text-align: center;">
                <img src="${fileUrl}" alt="Attachment" style="max-width: 100%; border-radius: 12px; box-shadow: 0 0 12px rgba(0,0,0,0.4);" />
              </div>
            </section>
          ` : ""}

          <footer style="border-top: 1px solid #333; padding-top: 20px; text-align: center; font-size: 13px; color: #888;">
            <p>This notification was sent via the <strong>Karanks1436 Admin Panel</strong>.</p>
            <p>© 2025 Karanks1436 • All rights reserved.</p>
          </footer>
        </div>
        `;

        return transporter.sendMail({
          from: '"Karanks1436 👾" <karanksxxx@gmail.com>',
          to: to_email,
          subject: "🔔 Notification from Admin",
          html,
        });
      })
    );

    res.status(200).send({ success: true, message: "Emails sent successfully!" });
  } catch (err) {
    console.error("Bulk Email Error:", err);
    res.status(500).send({ success: false, message: "Failed to send bulk emails" });
  }
});

// ---------------------------------------
// 💌 3️⃣ Contact Form Email
// ---------------------------------------
app.post("/send-contact-message", async (req, res) => {
  const { name, email, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: "All fields are required." });
  }

  try {
    const transporter = await createTransporter();

    const mailOptions = {
      from: `"KaranKS1436 Contact Form" <karanksxxx@gmail.com>`,
      to: "karanksxxx@gmail.com",
      replyTo: email,
      subject: `📨 New Contact Message from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; background: #111; color: #fff; padding: 20px; border-radius: 8px;">
          <h2 style="color: #00e5ff;">New Contact Form Message</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <hr style="border-color: #333;" />
          <p style="margin-top: 16px;"><strong>Message:</strong></p>
          <div style="background: #1c1c1c; padding: 12px; border-radius: 6px; color: #ddd;">${message}</div>
          <p style="margin-top: 24px; font-size: 12px; color: #666;">Sent on: ${new Date().toLocaleString()}</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ success: true, message: "Message sent!" });
  } catch (err) {
    console.error("Contact Message Error:", err);
    res.status(500).json({ success: false, message: "Failed to send contact message." });
  }
});

// ---------------------------------------
// 🚀 Server Setup
// ---------------------------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));











// const express = require("express");
// const nodemailer = require("nodemailer");
// const fs = require("fs");
// const path = require("path");
// const cors = require("cors");

// const app = express(); 
// app.use(cors());
// app.use(express.json());

// app.post("/send-login-email", async (req, res) => {
//   const { name, email } = req.body;

//   // Load your HTML template
//   const templatePath = path.join(__dirname, "templates", "loginTemplate.html");
//   let htmlTemplate = fs.readFileSync(templatePath, "utf-8");

//   // Replace placeholders
//   htmlTemplate = htmlTemplate
//     .replace(/{{user_name}}/g, name)
//     .replace(/{{login_time}}/g, new Date().toLocaleString());

//   const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//       user: "karanksxxx@gmail.com",
//       pass: "vqla xjtv arnf ulpf",
//     },
//   });

//   const mailOptions = {
//     from: '"KARANKS1436 👾" <karanksxxx@gmail.com>',
//     to: email,
//     subject: `Welcome back, ${name}!`,
//     html: htmlTemplate,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     res.status(200).json({ message: "Email sent successfully!" });
//   } catch (error) {
//     console.error("Nodemailer error:", error);
//     res.status(500).json({ error: "Failed to send email." });
//   }
// });


// app.post("/send-bulk-email", async (req, res) => {
//   const { emails, message, fileUrl } = req.body;

//   const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//       user: "karanksxxx@gmail.com",
//       pass: "vqla xjtv arnf ulpf",
//     },
//   });

//   try {
//     await Promise.all(
//       emails.map((to_email) => {
//         const html = `
//         <div style="max-width: 640px; margin: auto; font-family: 'Segoe UI', Roboto, sans-serif; background: linear-gradient(145deg, #1f1f22, #141416); color: #eaeaea; border-radius: 16px; padding: 28px; box-shadow: 0 0 20px rgba(0, 229, 255, 0.2); border: 1px solid #2b2b2e;">
//           <header style="text-align: center; border-bottom: 1px solid #333; padding-bottom: 20px; margin-bottom: 30px;">
//             <h2 style="color: #00e5ff; margin: 0; font-size: 26px;">🚀 Karanks1436 Notification</h2>
//             <p style="color: #aaa; font-size: 15px; margin-top: 8px;">You are receiving this as a valued member of <strong>Karanks1436</strong>.</p>
//           </header>

//           <section style="margin-bottom: 32px;">
//             <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📝 Message:</h3>
//             <div style="background: #262628; padding: 18px 20px; border-left: 4px solid #00e5ff; border-radius: 10px; font-size: 16px; color: #f1f1f1; line-height: 1.6;">
//               ${message || "No message provided."}
//             </div>
//           </section>

//           ${fileUrl ? `
//             <section style="margin-bottom: 32px;">
//               <h3 style="color: #00ffc3; font-size: 18px; margin-bottom: 10px;">📎 Attached File / Image:</h3>
//               <a href="${fileUrl}" target="_blank" style="display: inline-block; color: #4fc3f7; font-size: 15px; word-break: break-all; margin-bottom: 12px;">🔗 ${fileUrl}</a>
//               <div style="margin-top: 16px; text-align: center;">
//                 <img src="${fileUrl}" alt="Attachment" style="max-width: 100%; border-radius: 12px; box-shadow: 0 0 12px rgba(0,0,0,0.4);" />
//               </div>
//             </section>
//           ` : ""}

//           <footer style="border-top: 1px solid #333; padding-top: 20px; text-align: center; font-size: 13px; color: #888;">
//             <p>This notification was sent via the <strong>Karanks1436 Admin Panel</strong>.</p>
//             <p>© 2025 Karanks1436 • All rights reserved.</p>
//           </footer>
//         </div>
//         `;

//         return transporter.sendMail({
//           from: '"Karanks1436 👾" <karanksxxx@gmail.com>',
//           to: to_email,
//           subject: "🔔 Notification from Admin",
//           html,
//         });
//       })
//     );

//     res.status(200).send({ success: true, message: "Emails sent!" });
//   } catch (err) {
//     console.error("Send error:", err);
//     res.status(500).send({ success: false, message: "Failed to send emails" });
//   }
// });
// // ------------------------------
// // 📧 Contact Form Email Endpoint
// // ------------------------------
// app.post("/send-contact-message", async (req, res) => {
//   const { name, email, message } = req.body;

//   const transporter = nodemailer.createTransport({
//     service: "gmail",
//     auth: {
//       user: "karanksxxx@gmail.com",
//       pass: "vqla xjtv arnf ulpf", // App password
//     },
//   });

//   if (!name || !email || !message) {
//     return res.status(400).json({ error: "All fields are required." });
//   }

//   const mailOptions = {
//     from: `"KaranKS1436 Contact Form" <karanksxxx@gmail.com>`,
//     to: "karanksxxx@gmail.com",
//     replyTo: email, // 👈 This makes replies go to the user's address
//     subject: `📨 New Contact Message from ${name}`,
//     html: `
//       <div style="font-family: Arial, sans-serif; background: #111; color: #fff; padding: 20px; border-radius: 8px;">
//         <h2 style="color: #00e5ff;">New Contact Form Message</h2>
//         <p><strong>Name:</strong> ${name}</p>
//         <p><strong>Email:</strong> ${email}</p>
//         <hr style="border-color: #333;" />
//         <p style="margin-top: 16px;"><strong>Message:</strong></p>
//         <div style="background: #1c1c1c; padding: 12px; border-radius: 6px; color: #ddd;">${message}</div>
//         <p style="margin-top: 24px; font-size: 12px; color: #666;">Sent on: ${new Date().toLocaleString()}</p>
//       </div>
//     `,
//   };

//   try {
//     await transporter.sendMail(mailOptions);
//     res.status(200).json({ success: true, message: "Message sent!" });
//   } catch (err) {
//     console.error("Contact message error:", err);
//     res.status(500).json({ success: false, message: "Failed to send contact message." });
//   }
// });
// const PORT = 5000;
// app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
