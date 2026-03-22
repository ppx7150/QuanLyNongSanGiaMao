const sql = require("mssql");

const config = {
    user: "sa",
    password: "123456",
    server: "localhost",
    database: "QuanLyNongSanGiaMao",
    options: {
        trustServerCertificate: true
    }
}

async function connectDB() {
    try {
        await sql.connect(config);
        console.log("Database connected");
    } catch (err) {
        console.log(err);
    }
}

module.exports = { sql, connectDB };