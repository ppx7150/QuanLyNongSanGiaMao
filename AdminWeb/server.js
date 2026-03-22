const express = require("express")
const sql = require("mssql")

const app = express()

app.use(express.json())
app.use(express.static("public"))

/* ===============================
   DATABASE CONFIG
================================ */

const config = {
    user: "sa",
    password: "123456",
    server: "localhost",
    database: "QuanLyNongSanGiaMao",
    options: {
        trustServerCertificate: true
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
        SELECT code_value
        FROM QR_Code
        WHERE code_value = ${code}
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
        c.expiry_date
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
        qr_id,
        is_activated,
        FORMAT(time_activated,'HH:mm:ss dd/MM/yyyy') AS time_activated

        FROM QR_Code
        WHERE code_value = ${code}

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

        INSERT INTO Scan_Log (scan_id, qr_id, scan_time, ip_address, location)

        VALUES(

        (SELECT ISNULL(MAX(scan_id),0)+1 FROM Scan_Log),

        ${qr.qr_id},

        ${scanTime},

        ${ip},

        ${location}

        )

        `

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
    SELECT COUNT(*) AS total FROM QR_Code
    `

    const scans = await sql.query`
    SELECT COUNT(*) AS scans FROM Scan_Log
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
    SELECT * FROM Product
    `

    res.json(result.recordset)

})

/* ===============================
   ADMIN SCAN LOGS
================================ */

app.get("/admin/scanlogs", async (req, res) => {

    const result = await sql.query`

    SELECT *
    FROM Scan_Log
    ORDER BY scan_time DESC

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
        INSERT INTO Product(product_id, product_name, category, description)
        VALUES(${id}, ${name}, ${category}, ${description})
        `

        res.json({ message: "Created" })

    } catch (err) {

        res.status(500).send(err)

    }

})

app.get("/admin/api/products", async (req, res) => {

    const result = await sql.query`
    SELECT * FROM Product
    ORDER BY product_id
    `

    res.json(result.recordset)

})

app.delete("/admin/api/products/:id", async (req, res) => {

    const id = req.params.id

    try {

        await sql.query`
        DELETE FROM Product WHERE product_id = ${id}
        `

        res.json({ message: "Deleted" })

    } catch (err) {

        res.status(500).send(err)

    }

})

app.get("/admin/api/products", async (req, res) => {
    const result = await sql.query`SELECT * FROM Product`
    res.json(result.recordset)
})

app.get("/admin/api/producers", async (req, res) => {
    const result = await sql.query`SELECT * FROM Producer`
    res.json(result.recordset)
})

app.put("/admin/api/products/:id", async (req, res) => {

    const id = req.params.id
    const { name, category, description } = req.body

    try {

        await sql.query`
        UPDATE Product
        SET 
            product_name = ${name},
            category = ${category},
            description = ${description}
        WHERE product_id = ${id}
        `

        res.json({ message: "Updated" })

    } catch (err) {
        res.status(500).send(err)
    }

})

app.get("/admin/api/batch/check/:id", async (req, res) => {

    const id = req.params.id

    const result = await sql.query`
    SELECT * FROM Batch WHERE batch_id = ${id}
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
        SELECT * FROM Batch WHERE batch_id = ${batch_id}
        `

        if (check.recordset.length > 0) {
            return res.status(400).json({ message: "Batch ID already exists" })
        }

        await sql.query`
        INSERT INTO Batch(
            batch_id,
            product_id,
            producer_id,
            farm_location,
            packing_location,
            harvest_date,
            packing_date,
            delivery_date
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
        DELETE FROM Batch WHERE batch_id = ${id}
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
        SELECT * FROM Batch WHERE batch_id = ${batch_id} AND batch_id <> ${oldId}
        `

        if (check.recordset.length > 0) {
            return res.status(400).json({ message: "Batch ID already exists" })
        }

        await sql.query`
        UPDATE Batch
        SET
            batch_id = ${batch_id},
            product_id = ${product_id},
            producer_id = ${producer_id},
            farm_location = ${farm_location},
            packing_location = ${packing_location},
            harvest_date = ${harvest_date},
            packing_date = ${packing_date},
            delivery_date = ${delivery_date}
        WHERE batch_id = ${oldId}
        `

        res.json({ message: "Updated" })

    } catch (err) {
        res.status(500).send(err)
    }

})

app.get("/admin/api/batch", async (req, res) => {

    const result = await sql.query`
    SELECT 
        b.batch_id,
        b.product_id,
        b.producer_id,
        p.product_name,
        pr.producer_name,
        b.farm_location,
        b.packing_location,
        b.harvest_date,
        b.packing_date,
        b.delivery_date
    FROM Batch b
    JOIN Product p ON b.product_id = p.product_id
    JOIN Producer pr ON b.producer_id = pr.producer_id
    ORDER BY b.batch_id DESC
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
        b.batch_id,
        p.product_name,
        pr.producer_name,
        b.farm_location,
        b.packing_location
    FROM Batch b
    JOIN Product p ON b.product_id = p.product_id
    JOIN Producer pr ON b.producer_id = pr.producer_id
    WHERE b.batch_id = ${id}
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
                SELECT * FROM QR_Code WHERE code_value = ${code}
                `

                if (check.recordset.length === 0) {
                    exists = false
                }
            }

            await sql.query`
            INSERT INTO QR_Code (code_value, batch_id, is_activated)
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
            qr_id,
            code_value,
            is_activated,
            time_activated
        FROM QR_Code
        WHERE batch_id = ${batch_id}
        ORDER BY qr_id DESC
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
        INSERT INTO Producer(producer_id, producer_name, address)
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
        UPDATE Producer
        SET 
            producer_name = ${name},
            address = ${address}
        WHERE producer_id = ${id}
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
        SELECT * FROM Batch WHERE producer_id = ${id}
        `

        await sql.query`
        DELETE FROM Producer WHERE producer_id = ${id}
        `

        res.json({ message: "Deleted" })

    } catch (err) {
        res.status(500).send(err)
    }
})

app.delete("/admin/api/scanlogs/:id", async (req, res) => {

    const id = req.params.id

    await sql.query`
    DELETE FROM Scan_Log WHERE scan_id = ${id}
    `

    res.json({ message: "Deleted" })
})

// GET
app.get("/admin/api/cert-types", async (req, res) => {
    const result = await sql.query`SELECT * FROM Certification_Type`
    res.json(result.recordset)
})

// CREATE
app.post("/admin/api/cert-types", async (req, res) => {
    const { id, name } = req.body

    await sql.query`
    INSERT INTO Certification_Type VALUES (${id}, ${name})
    `

    res.json({ message: "Created" })
})

// DELETE
app.delete("/admin/api/cert-types/:id", async (req, res) => {

    const id = req.params.id

    await sql.query`
    DELETE FROM Certification_Type WHERE certification_type_id = ${id}
    `

    res.json({ message: "Deleted" })
})

// GET
app.get("/admin/api/certifications", async (req, res) => {

    const result = await sql.query`
    SELECT c.*, 
           ct.certification_type,
           p.product_name,
           pr.producer_name
    FROM Certification c
    JOIN Certification_Type ct ON c.certification_type_id = ct.certification_type_id
    JOIN Product p ON c.product_id = p.product_id
    JOIN Producer pr ON c.producer_id = pr.producer_id
    ORDER BY c.certification_id DESC
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
    INSERT INTO Certification VALUES(
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
    DELETE FROM Certification WHERE certification_id = ${id}
    `

    res.json({ message: "Deleted" })
})

connectDB()

app.listen(3000, () => {

    console.log("Server running at http://localhost:3000")

})