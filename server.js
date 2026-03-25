const cors = require("cors")
const express = require("express")
const sql = require("mssql")

const app = express()

app.use(cors())
app.use(express.json())
app.use(express.static("public"))

/* ===============================
   DATABASE CONFIG
================================ */

const config = {
    user: "saadmin",
    password: "123456Aa@",
    server: "qlnsgm.database.windows.net",
    database: "QuanLyNongSanGiaMao",
    port: 1433,
    options: {
        encrypt: true,
        trustServerCertificate: false
    }
}

/* ===============================
   CONNECT DATABASE
================================ */

async function connectDB() {

    try {

        await sql.connect(config)
        console.log("Database connected")

    } catch (err) {

        console.log(err)

    }

}

/* ===============================
   RANDOM QR GENERATOR
================================ */

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
        SELECT codeVal
        FROM QRCODE
        WHERE codeVal = ${code}
        `

        if (check.recordset.length === 0) {

            return code

        }

    }

}

/* ===============================
   PRODUCT INFORMATION
================================ */

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
        ON c.certID = ct.certID

        WHERE q.codeVal = ${code}

        `

        res.json(result.recordset)

    }
    catch (err) {

        res.send(err)

    }

})

/* ===============================
   VERIFY QR
================================ */

app.get("/verify/:code", async (req, res) => {

    const code = req.params.code

    try {

        const result = await sql.query`

        SELECT 
        qrID,
        isAct,
        FORMAT(timeAct,'HH:mm:ss dd/MM/yyyy') AS timeAct

        FROM QRCODE
        WHERE codeVal = ${code}

        `

        if (result.recordset.length === 0) {

            return res.json({
                status: "fake"
            })

        }

        const qr = result.recordset[0]

        const ip = req.ip || req.connection.remoteAddress
        const scanTime = new Date()
        const location = "Unknown"

        await sql.query`

        INSERT INTO SCANLOG (sID, qrID, sTime, IP, sLoc)

        VALUES(

        (SELECT ISNULL(MAX(sID),0)+1 FROM SCANLOG),

        ${qr.qrID},

        ${scanTime},

        ${ip},

        ${location}

        )

        `

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

/* ===============================
   SCAN ROUTE (HIDE QUERY STRING)
================================ */

app.get("/scan/:code", (req, res) => {

    res.sendFile(__dirname + "/public/product.html")

})

/* ===============================
   ADMIN DASHBOARD
================================ */

app.get("/admin/dashboard", async (req, res) => {

    const totalQR = await sql.query`
    SELECT COUNT(*) AS total FROM QRCODE
    `

    const scans = await sql.query`
    SELECT COUNT(*) AS scans FROM SCANLOG
    `

    res.json({

        totalQR: totalQR.recordset[0].total,
        totalScans: scans.recordset[0].scans

    })

})

/* ===============================
   ADMIN PRODUCTS
================================ */

app.get("/admin/products", async (req, res) => {

    const result = await sql.query`
    SELECT * FROM PRODUCT
    `

    res.json(result.recordset)

})

/* ===============================
   ADMIN SCAN LOGS
================================ */

app.get("/admin/scanlogs", async (req, res) => {

    const result = await sql.query`

    SELECT *
    FROM SCANLOG
    ORDER BY sTime DESC

    `

    res.json(result.recordset)

})

/* ===============================
   START SERVER
================================ */

app.post("/admin/api/products", express.json(), async (req, res) => {

    const { id, name, category, description } = req.body

    try {

        await sql.query`
        INSERT INTO PRODUCT(pID, pName, category, des)
        VALUES(${id}, ${name}, ${category}, ${description})
        `

        res.json({ message: "Created" })

    } catch (err) {

        res.status(500).send(err)

    }

})

app.get("/admin/api/products", async (req, res) => {

    const result = await sql.query`
    SELECT * FROM PRODUCT
    ORDER BY pID
    `

    res.json(result.recordset)

})

app.delete("/admin/api/products/:id", async (req, res) => {

    const id = req.params.id

    try {

        await sql.query`
        DELETE FROM PRODUCT WHERE pID = ${id}
        `

        res.json({ message: "Deleted" })

    } catch (err) {

        res.status(500).send(err)

    }

})

app.get("/admin/api/producers", async (req, res) => {
    const result = await sql.query`SELECT * FROM PRODUCER`
    res.json(result.recordset)
})

app.put("/admin/api/products/:id", async (req, res) => {

    const id = req.params.id
    const { name, category, description } = req.body

    try {

        await sql.query`
        UPDATE PRODUCT
        SET 
            pName = ${name},
            category = ${category},
            des = ${description}
        WHERE pID = ${id}
        `

        res.json({ message: "Updated" })

    } catch (err) {
        res.status(500).send(err)
    }

})

app.get("/admin/api/batch/check/:id", async (req, res) => {

    const id = req.params.id

    const result = await sql.query`
    SELECT * FROM BATCH WHERE bID = ${id}
    `

    if (result.recordset.length > 0) {
        return res.json({ exists: true })
    }

    res.json({ exists: false })
})

app.post("/admin/api/batch", express.json(), async (req, res) => {

    const {
        batch_id,
        product_id,
        producer_id,
        farm_location,
        packing_location,
        harvest_date,
        packing_date,
        delivery_date
    } = req.body

    try {

        // check trùng
        const check = await sql.query`
        SELECT * FROM BATCH WHERE bID = ${batch_id}
        `

        if (check.recordset.length > 0) {
            return res.status(400).json({ message: "Batch ID already exists" })
        }

        await sql.query`
        INSERT INTO BATCH(
            bID,
            pID,
            prID,
            farmLoc,
            packLoc,
            harDate,
            packDate,
            deliDate
        )
        VALUES(
            ${batch_id},
            ${product_id},
            ${producer_id},
            ${farm_location},
            ${packing_location},
            ${harvest_date},
            ${packing_date},
            ${delivery_date}
        )
        `

        res.json({ message: "Created" })

    } catch (err) {
        res.status(500).send(err)
    }

})

app.delete("/admin/api/batch/:id", async (req, res) => {

    const id = req.params.id

    try {

        await sql.query`
        DELETE FROM BATCH WHERE bID = ${id}
        `

        res.json({ message: "Deleted" })

    } catch (err) {
        res.status(500).send(err)
    }

})

app.put("/admin/api/batch/:id", express.json(), async (req, res) => {

    const oldId = req.params.id

    const {
        batch_id,
        product_id,
        producer_id,
        farm_location,
        packing_location,
        harvest_date,
        packing_date,
        delivery_date
    } = req.body

    try {

        // check nếu đổi ID và bị trùng
        const check = await sql.query`
        SELECT * FROM BATCH WHERE bID = ${batch_id} AND bID <> ${oldId}
        `

        if (check.recordset.length > 0) {
            return res.status(400).json({ message: "Batch ID already exists" })
        }

        await sql.query`
        UPDATE BATCH
        SET
            bID = ${batch_id},
            pID = ${product_id},
            prID = ${producer_id},
            farmLoc = ${farm_location},
            packLoc = ${packing_location},
            harDate = ${harvest_date},
            packDate = ${packing_date},
            deliDate = ${delivery_date}
        WHERE bID = ${oldId}
        `

        res.json({ message: "Updated" })

    } catch (err) {
        res.status(500).send(err)
    }

})

app.get("/admin/api/batch", async (req, res) => {

    const result = await sql.query`
    SELECT 
        b.bID,
        b.pID,
        b.prID,
        p.pName,
        pr.prName,
        b.farmLoc,
        b.packLoc,
        b.harDate,
        b.packDate,
        b.deliDate
    FROM BATCH b
    JOIN PRODUCT p ON b.pID = p.pID
    JOIN PRODUCER pr ON b.prID = pr.prID
    ORDER BY b.bID DESC
    `

    res.json(result.recordset)

})

function generateQRValue(length = 16) {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
    let result = ""

    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length))
    }

    return result
}

app.get("/admin/api/batch/:id", async (req, res) => {

    const id = req.params.id

    const result = await sql.query`
    SELECT 
        b.bID,
        p.pName,
        pr.prName,
        b.farmLoc,
        b.packLoc
    FROM BATCH b
    JOIN PRODUCT p ON b.pID = p.pID
    JOIN PRODUCER pr ON b.prID = pr.prID
    WHERE b.bID = ${id}
    `

    res.json(result.recordset[0] || null)
})

app.post("/admin/api/qrcode/generate", express.json(), async (req, res) => {

    const { batch_id, amount } = req.body

    const qty = parseInt(amount)

    if (!qty || qty <= 0) {
        return res.status(400).json({ message: "Số lượng không hợp lệ" })
    }

    try {

        let inserted = []

        for (let i = 0; i < qty; i++) {

            let code
            let exists = true

            // đảm bảo unique
            while (exists) {
                code = generateQRValue()

                const check = await sql.query`
                SELECT * FROM QRCODE WHERE codeVal = ${code}
                `

                if (check.recordset.length === 0) {
                    exists = false
                }
            }

            await sql.query`
            INSERT INTO QRCODE (codeVal, bID, isAct)
            VALUES (${code}, ${batch_id}, 0)
            `

            inserted.push(code)
        }

        res.json({
            message: "Tạo QR thành công",
            data: inserted
        })

    } catch (err) {
        console.log(err)
        res.status(500).json({ message: "Lỗi tạo QR" })
    }

})

app.get("/admin/api/qrcode/:batch_id", async (req, res) => {

    const batch_id = req.params.batch_id

    try {

        const result = await sql.query`
        SELECT 
            qrID,
            codeVal,
            isAct,
            timeAct
        FROM QRCODE
        WHERE bID = ${batch_id}
        ORDER BY qrID DESC
        `

        res.json(result.recordset)

    } catch (err) {
        console.log("QR API ERROR:", err)
        res.status(500).json({ message: "Lỗi server" })
    }

})

app.post("/admin/api/producers", async (req, res) => {

    const { id, name, address } = req.body

    try {
        await sql.query`
        INSERT INTO PRODUCER(prID, prName, address)
        VALUES(${id}, ${name}, ${address})
        `

        res.json({ message: "Created" })

    } catch (err) {
        res.status(500).send(err)
    }
})

app.put("/admin/api/producers/:id", async (req, res) => {

    const id = req.params.id
    const { name, address } = req.body

    try {

        await sql.query`
        UPDATE PRODUCER
        SET 
            prName = ${name},
            address = ${address}
        WHERE prID = ${id}
        `

        res.json({ message: "Updated" })

    } catch (err) {
        res.status(500).send(err)
    }
})

app.delete("/admin/api/producers/:id", async (req, res) => {

    const id = req.params.id

    try {

        const check = await sql.query`
        SELECT * FROM BATCH WHERE prID = ${id}
        `

        await sql.query`
        DELETE FROM PRODUCER WHERE prID = ${id}
        `

        res.json({ message: "Deleted" })

    } catch (err) {
        res.status(500).send(err)
    }
})

app.delete("/admin/api/scanlogs/:id", async (req, res) => {

    const id = req.params.id

    await sql.query`
    DELETE FROM SCANLOG WHERE sID = ${id}
    `

    res.json({ message: "Deleted" })
})

// GET
app.get("/admin/api/cert-types", async (req, res) => {
    const result = await sql.query`SELECT * FROM CERTIFICATIONTYPE`
    res.json(result.recordset)
})

// CREATE
app.post("/admin/api/cert-types", async (req, res) => {
    const { id, name } = req.body

    await sql.query`
    INSERT INTO CERTIFICATIONTYPE VALUES (${id}, ${name})
    `

    res.json({ message: "Created" })
})

// DELETE
app.delete("/admin/api/cert-types/:id", async (req, res) => {

    const id = req.params.id

    await sql.query`
    DELETE FROM CERTIFICATIONTYPE WHERE typeID = ${id}
    `

    res.json({ message: "Deleted" })
})

app.put("/admin/api/cert-types/:id", async (req, res) => {

    const id = req.params.id
    const { name } = req.body

    await sql.query`
        UPDATE CERTIFICATIONTYPE
        SET typeName = ${name}
        WHERE typeID = ${id}
    `

    res.json({ message: "Updated" })
})

// GET
app.get("/admin/api/certifications", async (req, res) => {

    const result = await sql.query`
    SELECT c.*, 
           ct.typeName,
           p.pName,
           pr.prName
    FROM Certification c
    JOIN CERTIFICATIONTYPE ct ON c.typeID = ct.typeID
    JOIN Product p ON c.pID = p.pID
    JOIN PRODUCER pr ON c.prID = pr.prID
    ORDER BY c.certID DESC
    `

    res.json(result.recordset)
})

// CREATE
app.post("/admin/api/certifications", async (req, res) => {

    const {
        id, type, product, producer,
        number, issue, expiry, image
    } = req.body

    await sql.query`
    INSERT INTO CERTIFICATION VALUES(
        ${id}, ${type}, ${product}, ${producer},
        ${number}, ${issue}, ${expiry}, ${image}
    )
    `

    res.json({ message: "Created" })
})

// DELETE
app.delete("/admin/api/certifications/:id", async (req, res) => {

    const id = req.params.id

    await sql.query`
    DELETE FROM CERTIFICATION WHERE certID = ${id}
    `

    res.json({ message: "Deleted" })
})

app.put("/admin/api/certifications/:id", async (req, res) => {

    const id = req.params.id

    const {
        type, product, producer,
        number, issue, expiry, image
    } = req.body

    await sql.query`
        UPDATE CERTIFICATION
        SET 
            typeID = ${type},
            pID = ${product},
            prID = ${producer},
            certNum = ${number},
            isuDate = ${issue},
            expDate = ${expiry},
            certImg = ${image}
        WHERE certID = ${id}
    `

    res.json({ message: "Updated" })
})

connectDB()

const PORT = process.env.PORT || 3000

app.listen(PORT, () => {
    console.log("Server running at port " + PORT)
})