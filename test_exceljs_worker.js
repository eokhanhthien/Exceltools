const ExcelJS = require('./WebApp/exceljs.min.js');

async function test() {
    console.log("ExcelJS version:", ExcelJS.Workbook ? "Loaded" : "Failed");
}
test();
