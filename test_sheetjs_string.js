const XLSX = require('./WebApp/xlsx.full.min.js');

const html = "<table><tr><td>Thương</td></tr></table>";
// Test 1: type string
try {
    const wb1 = XLSX.read(html, { type: 'string' }); // This expects BINARY string!
    console.log("type: 'string' ->", wb1.Sheets[wb1.SheetNames[0]]['A1'].v);
} catch(e) { console.log(e); }

// Test 2: type binary
try {
    const wb2 = XLSX.read(html, { type: 'binary' }); // Deprecated but means binary string
    console.log("type: 'binary' ->", wb2.Sheets[wb2.SheetNames[0]]['A1'].v);
} catch(e) { console.log(e); }

