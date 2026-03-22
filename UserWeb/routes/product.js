const express = require("express");
const router = express.Router();
const { sql } = require("../db");

router.get("/:code", async (req, res) => {

    const code = req.params.code;

    try {

        const result = await sql.query`
        SELECT p.product_name,
               pr.producer_name,
               b.farm_location,
               b.harvest_date,
               b.packing_date
        FROM QR_Code q
        JOIN Batch b ON q.batch_id = b.batch_id
        JOIN Product p ON b.product_id = p.product_id
        JOIN Producer pr ON b.producer_id = pr.producer_id
        WHERE q.code_value = ${code}
        `;

        res.json(result.recordset[0]);

    } catch (err) {
        res.status(500).send(err);
    }

});

module.exports = router;