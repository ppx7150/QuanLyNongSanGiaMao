const express = require("express")
const sql = require("mssql")

const app = express()
app.use(express.static("public"))

const config = {
    user: "sa",
    password: "123456",
    server: "localhost",
    database: "QuanLyNongSanGiaMao",
    options: {
        trustServerCertificate: true
    }
}

function generateQRcode(length = 12) {

    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = ""

    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    return result
}

async function generateUniqueQR() {

    while (true) {

        const code = generateQRcode()

        const check = await sql.query`
            SELECT code_value
            FROM QR_Code
            WHERE code_value = ${code}
        `

        if (check.recordset.length === 0) {
            return code
        }

    }

}

async function connectDB() {
    try {
        await sql.connect(config)
        console.log("Database connected")
    } catch (err) {
        console.log(err)
    }
}

app.get("/product/:code", async (req, res) => {

    const code = req.params.code

    try {

        const result = await sql.query`
        SELECT 
        p.product_name,
        pr.producer_name,
        pr.address,
        b.farm_location,
        b.packing_location,
        b.harvest_date,
        b.packing_date,
        b.delivery_date,
        ct.certification_type,
        c.certification_number,
        c.expiry_date,
        c.certification_image_url
        FROM QR_Code q
        JOIN Batch b ON q.batch_id = b.batch_id
        JOIN Product p ON b.product_id = p.product_id
        JOIN Producer pr ON b.producer_id = pr.producer_id
        LEFT JOIN Certification c 
            ON p.product_id = c.product_id 
            AND pr.producer_id = c.producer_id
        LEFT JOIN Certification_Type ct 
            ON c.certification_type_id = ct.certification_type_id
        WHERE q.code_value = ${code}
        `

        res.json(result.recordset)

    } catch (err) {

        res.send(err)

    }

})

app.get("/verify/:code", async (req, res) => {

    const code = req.params.code

    try {

        await sql.connect(config)

        const result = await sql.query`
            SELECT qr_id, is_activated, FORMAT(time_activated, 'HH:mm:ss "ngày" dd/MM/yyyy') AS time_activated
            FROM QR_Code
            WHERE code_value = ${code}
        `

        // QR không tồn tại
        if (result.recordset.length === 0) {

            return res.json({
                status: "fake"
            })

        }

        const qr = result.recordset[0]

        // Lấy IP người quét
        const ip = req.ip || req.connection.remoteAddress

        // Lấy thời gian hiện tại
        const scanTime = new Date()

        // Tạm thời location để Unknown
        const location = "Unknown"

        // Lưu log scan
        await sql.query`
            INSERT INTO Scan_Log (qr_id, scan_time, ip_address, location)
            VALUES (
                ${qr.qr_id},
                ${scanTime},
                ${ip},
                ${location}
            )
        `


        // QR chưa từng quét
        if (qr.is_activated === false) {

            await sql.query`
                UPDATE QR_Code
                SET
                    is_activated = 1,
                    time_activated = GETDATE()
                WHERE qr_id = ${qr.qr_id}
            `

            return res.json({
                status: "authentic"
            })

        }

        // QR đã quét
        return res.json({
            status: "scanned",
            first_scan: qr.time_activated
        })

    }
    catch (err) {

        console.log(err)
        res.status(500).send(err)

    }

})

app.get("/generateQR/:batch_id", async (req, res) => {

    const batch_id = req.params.batch_id

    try {

        const code = await generateUniqueQR()

        const result = await sql.query`
        INSERT INTO QR_Code (qr_id, batch_id, code_value, is_activated)
        VALUES (
            (SELECT ISNULL(MAX(qr_id),0)+1 FROM QR_Code),
            ${batch_id},
            ${code},
            0
        )
        `

        res.json({
            message: "QR code created",
            code: code,
            link: "http://localhost:3000/scan/" + code
        })

    } catch (err) {

        console.log(err)
        res.status(500).send(err)

    }

})

app.get("/scan/:code", (req, res) => {

    res.sendFile(__dirname + "/public/product.html")

})

connectDB()

app.listen(3000, () => {

    console.log("Server running at http://localhost:3000")

})