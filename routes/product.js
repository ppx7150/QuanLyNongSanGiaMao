const express = require("express");
const router = express.Router();
const { sql } = require("../db");

router.get("/:code", async (req, res) => {

    const code = req.params.code;

    try {

        const result = await sql.query`
        SELECT p.pName,
               pr.prName,
               b.farmLoc,
               b.harDate,
               b.packDate
        FROM QRCODE q
        JOIN BATCH b ON q.bID = b.bID
        JOIN PRODUCT p ON b.pID = p.pID
        JOIN PRODUCER pr ON b.prID = pr.prID
        WHERE q.codeVal = ${code}
        `;

        res.json(result.recordset[0]);

    } catch (err) {
        res.status(500).send(err);
    }

});

module.exports = router;