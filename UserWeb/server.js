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
        p.pName,
        pr.prName,
        pr.address,
        b.farmLoc,
        b.packLoc,
        b.harDate,
        b.packDate,
        b.deliDate,
        ct.typeName,
        c.certNum,
        c.expDate,
        c.certImg
        FROM QRCODE q
        JOIN BATCH b ON q.bID = b.bID
        JOIN PRODUCT p ON b.pID = p.pID
        JOIN PRODUCER pr ON b.prID = pr.prID
        LEFT JOIN CERTIFICATION c
            ON p.pID = c.pID
            AND pr.prID = c.prID
        LEFT JOIN CERTIFICATIONTYPE ct
            ON c.typeID = ct.typeID
        WHERE q.codeVal = ${code}
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
            SELECT qrID, isAct, FORMAT(timeAct, 'HH:mm:ss "ngày" dd/MM/yyyy') AS timeAct
            FROM QRCODE
            WHERE codeVal = ${code}
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
            INSERT INTO SCANLOG (qrID, sTime, IP, sLoc)
            VALUES (
                ${qr.qrID},
                ${scanTime},
                ${ip},
                ${location}
            )
        `


        // QR chưa từng quét
        if (qr.isAct === false) {

            await sql.query`
                UPDATE QRCODE
                SET
                    isAct = 1,
                    timeAct = GETDATE()
                WHERE qrID = ${qr.qrID}
            `

            return res.json({
                status: "authentic"
            })

        }

        // QR đã quét
        return res.json({
            status: "scanned",
            first_scan: qr.timeAct
        })

    }
    catch (err) {

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