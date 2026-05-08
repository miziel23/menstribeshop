// deno-lint-ignore-file
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function AdminSalesReport() {
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterSoldBy, setFilterSoldBy] = useState("");

  // Date filter
  const [dateFilter, setDateFilter] = useState("all");

  // Custom date range
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Fetch sales
  const fetchSales = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("sales")
      .select("*")
      .order("date", { ascending: false });

    if (error) {
      console.error("Error:", error);
      MySwal.fire({ icon: "error", title: "Error", text: "Failed to fetch sales." });
    } else {
      setSales(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSales();
  }, []);

  // ---------------------------
  // DATE FILTER LOGIC
  // ---------------------------
  const filteredBySoldBy = filterSoldBy
    ? sales.filter((s) => s.sold_by === filterSoldBy)
    : sales;

  const getDateFilterRange = () => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(todayStart);
    todayEnd.setHours(23, 59, 59, 999);

    switch (dateFilter) {
      case "today":
        return { start: todayStart, end: todayEnd };
      case "yesterday":
        const yStart = new Date(todayStart);
        yStart.setDate(yStart.getDate() - 1);
        const yEnd = new Date(yStart);
        yEnd.setHours(23, 59, 59, 999);
        return { start: yStart, end: yEnd };
      case "last7":
        const last7 = new Date(todayStart);
        last7.setDate(last7.getDate() - 7);
        return { start: last7, end: todayEnd };
      case "last30":
        const last30 = new Date(todayStart);
        last30.setDate(last30.getDate() - 30);
        return { start: last30, end: todayEnd };
      case "lastYear":
        return {
          start: new Date(now.getFullYear() - 1, 0, 1),
          end: new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59),
        };
      case "custom":
        return {
          start: startDate ? new Date(startDate) : null,
          end: endDate
            ? new Date(new Date(endDate).setHours(23, 59, 59, 999))
            : null,
        };
      default:
        return { start: null, end: null };
    }
  };

  const { start, end } = getDateFilterRange();

  const filteredSales = filteredBySoldBy.filter((s) => {
    const saleDate = new Date(s.date);
    if (start && saleDate < start) return false;
    if (end && saleDate > end) return false;
    return true;
  });

  // ---------------------------
  // CALCULATIONS
  // ---------------------------
  const computeSubtotal = (sale) => {
    const qty = parseFloat(sale.quantity || 0);
    const price = parseFloat(sale.selling_price || sale.price || 0);
    const subtotal = parseFloat(sale.subtotal || 0);
    return subtotal > 0 ? subtotal : qty * price;
  };

  const computeTotalSales = (sale) => {
    const subtotal = computeSubtotal(sale);
    const shipping = parseFloat(sale.shipping_fee || 0);
    return subtotal + shipping;
  };

  const computeProfit = (sale) => {
    const qty = parseFloat(sale.quantity || 0);
    const sellingPrice = parseFloat(sale.selling_price || sale.price || 0);
    const costPrice = parseFloat(sale.cost_price || 0);
    return sellingPrice * qty - costPrice * qty;
  };

  const totalSales = filteredSales
    .reduce((sum, s) => sum + computeTotalSales(s), 0)
    .toFixed(2);

  const totalItemsSold = filteredSales.reduce(
    (sum, s) => sum + parseFloat(s.quantity || 0),
    0
  );

  const totalProfit = filteredSales
    .reduce((sum, s) => sum + computeProfit(s), 0)
    .toFixed(2);

  // ---------------------------
  // PDF DOWNLOAD
  // ---------------------------
  const downloadPDF = () => {
    try {
      const doc = new jsPDF("p", "pt");
      doc.setFontSize(18);
      doc.text("Sales Report", 40, 40);

      // Add date range
      let dateRangeText = "All Dates";
      if (start && end) {
        const startStr = start.toLocaleDateString();
        const endStr = end.toLocaleDateString();
        dateRangeText = startStr === endStr ? startStr : `${startStr} - ${endStr}`;
      }
      doc.setFontSize(12);
      doc.text(`Date Range: ${dateRangeText}`, 40, 60);

      // Add Sold By filter
      let soldByText = "All Sold";
      if (filterSoldBy) {
        soldByText = filterSoldBy;
      }
      doc.text(`Sold By: ${soldByText}`, 40, 75);

      const tableColumn = [
        "#","Product","Qty","Cost Price","Selling Price",
        "Subtotal","Shipping","Total","Profit","Payment","Sold By","Date"
      ];

      const tableRows = filteredSales.map((s, idx) => [
        idx + 1,
        s.product_name || "",
        s.quantity || 0,
        (parseFloat(s.cost_price) || 0).toFixed(2),
        (parseFloat(s.selling_price || s.price) || 0).toFixed(2),
        computeSubtotal(s).toFixed(2),
        (parseFloat(s.shipping_fee) || 0).toFixed(2),
        computeTotalSales(s).toFixed(2),
        computeProfit(s).toFixed(2),
        s.payment_method || "",
        s.sold_by || "",
        new Date(s.date).toLocaleDateString(),
      ]);

      autoTable(doc, {
        head: [tableColumn],
        body: tableRows,
        startY: 90,
        theme: "grid",
        styles: { fontSize: 10 },
      });

      doc.save("Sales_Report.pdf");
    } catch (err) {
      console.error(err);
      MySwal.fire({ icon: "error", title: "Error", text: "Failed to download PDF." });
    }
  };

  return (
    <div className="p-4">
      {/* HEADER */}
      <div className="flex justify-between mb-4">
        <h2 className="text-2xl font-bold">📊 Sales Report</h2>
        <button
          onClick={downloadPDF}
          className="bg-blue-600 text-white px-4 py-2 rounded"
        >
          📄 Download PDF
        </button>
      </div>

      {/* FILTERS */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 mb-4">

        {/* LEFT SIDE: Date filter + custom range */}
        <div className="flex flex-col md:flex-row items-center gap-2 w-full md:w-2/3">
        <select
  value={dateFilter}
  onChange={(e) => {
    const value = e.target.value;
    setDateFilter(value);
    if (value !== "custom") {
      // Clear custom dates when not in custom mode
      setStartDate("");
      setEndDate("");
    }
  }}
  className="border p-2 rounded w-full md:w-48"
>
  <option value="all">All Dates</option>
  <option value="today">Today</option>
  <option value="yesterday">Yesterday</option>
  <option value="last7">Last 7 Days</option>
  <option value="last30">Last 30 Days</option>
  <option value="lastYear">Last Year</option>
  <option value="custom">Custom</option>
</select>


          {dateFilter === "custom" && (
            <div className="border rounded p-2 flex items-center gap-2 bg-white shadow-inner flex-1">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border-none flex-1 focus:ring-0 outline-none"
              />
              <span className="font-bold text-lg">—</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border-none flex-1 focus:ring-0 outline-none"
              />
            </div>
          )}
        </div>

        {/* RIGHT SIDE: Sold By */}
        <div className="w-full md:w-1/4">
          <select
            value={filterSoldBy}
            onChange={(e) => setFilterSoldBy(e.target.value)}
            className="border p-2 rounded w-full"
          >
            <option value="">All Sold</option>
            <option value="On Store">On Store</option>
            <option value="Online">Online</option>
          </select>
        </div>

      </div>

      {/* SUMMARY */}
      <div className="flex justify-center gap-8 mb-6 flex-wrap">
        <div className="bg-blue-300 p-6 rounded shadow w-72 text-center">
          <h3 className="font-bold text-xl text-blue-700">Items Sold</h3>
          <p className="text-3xl">{totalItemsSold}</p>
        </div>

        <div className="bg-green-300 p-6 rounded shadow w-72 text-center">
          <h3 className="font-bold text-xl text-green-700">Gross Sales</h3>
          <p className="text-3xl">{totalSales}</p>
        </div>

        <div className="bg-yellow-300 p-6 rounded shadow w-72 text-center">
          <h3 className="font-bold text-xl text-yellow-700">Profit</h3>
          <p className="text-3xl">{totalProfit}</p>
        </div>
      </div>

      {/* TABLE */}
      <div className="overflow-x-auto border rounded shadow">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-2 border">#</th>
              <th className="p-2 border">Product</th>
              <th className="p-2 border">Qty</th>
              <th className="p-2 border">Cost Per Unit</th>
              <th className="p-2 border">Selling Price</th>
              <th className="p-2 border">Subtotal</th>
              <th className="p-2 border">Shipping</th>
              <th className="p-2 border">Total</th>
              <th className="p-2 border">Profit</th>
              <th className="p-2 border">Payment</th>
              <th className="p-2 border">Sold By</th>
              <th className="p-2 border">Date</th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={12} className="p-4 text-center">
                  Loading sales...
                </td>
              </tr>
            ) : filteredSales.length === 0 ? (
              <tr>
                <td colSpan={12} className="p-4 text-center">
                  No sales found.
                </td>
              </tr>
            ) : (
              filteredSales.map((s, idx) => (
                <tr key={s.id}>
                  <td className="p-2 border text-center">{idx + 1}</td>
                  <td className="p-2 border">{s.product_name || ""}</td>
                  <td className="p-2 border text-center">{s.quantity || 0}</td>
                  <td className="p-2 border text-right">
                    {(parseFloat(s.cost_price) || 0).toFixed(2)}
                  </td>
                  <td className="p-2 border text-right">
                    {(parseFloat(s.price || s.selling_price) || 0).toFixed(2)}
                  </td>
                  <td className="p-2 border text-right">
                    {computeSubtotal(s).toFixed(2)}
                  </td>
                  <td className="p-2 border text-right">
                    {(parseFloat(s.shipping_fee) || 0).toFixed(2)}
                  </td>
                  <td className="p-2 border text-right">
                    {computeTotalSales(s).toFixed(2)}
                  </td>
                  <td className="p-2 border text-right">
                    {computeProfit(s).toFixed(2)}
                  </td>
                  <td className="p-2 border text-center">{s.payment_method || ""}</td>
                  <td className="p-2 border text-center">{s.sold_by || ""}</td>
                  <td className="p-2 border">
                    {new Date(s.date).toLocaleDateString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
