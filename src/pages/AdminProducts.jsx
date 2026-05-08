// deno-lint-ignore-file
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function AdminProducts({
  products,
  fetchProducts,
  sendProductNotification,
  stockFilter,        // ✅ from parent
  movingFilter,       // ✅ from parent
  setStockFilter,     // ✅ optional: allow updating from dropdown
  setMovingFilter
}) {
  const [showProductModal, setShowProductModal] = useState(false);
  const [showStockModal, setShowStockModal] = useState(false);
  const [stockProduct, setStockProduct] = useState(null);
  const [stockAmount, setStockAmount] = useState("");
  const [loadingProductSave, setLoadingProductSave] = useState(false);
  const [loadingStockSave, setLoadingStockSave] = useState(false);
  const [loading, setLoading] = useState(true);
  const [totalSoldMap, setTotalSoldMap] = useState({}); // { product_id: totalSold }

  const LOW_STOCK_THRESHOLD = 100;
  const HIGH_STOCK_THRESHOLD = 500;
  const categories = ["Hair Product", "Perfume", "Hair Cutting Tool"];

  const [newProduct, setNewProduct] = useState({
    id: null,
    name: "",
    description: "",
    cost_price: "",
    price: "",
    stock: "",
    category: "Hair Product",
    weight: "",
    imageFile: null,
    image_url: ""
  });

  const loadProducts = async () => {
    if (typeof fetchProducts !== "function") return setLoading(false);
    setLoading(true);
    const start = Date.now();
    try {
      await fetchProducts();
      await loadTotalSoldFromSales();
    } catch (err) {
      console.error("fetchProducts error:", err);
      MySwal.fire({ icon: "error", title: "Error", text: "Failed to fetch products." });
    } finally {
      const elapsed = Date.now() - start;
      const minVisible = 350; // ms
      const wait = elapsed < minVisible ? minVisible - elapsed : 0;
      setTimeout(() => setLoading(false), wait);
    }
  };

  const loadTotalSoldFromSales = async () => {
    try {
      const { data, error } = await supabase.from("sales").select("product_id, quantity");
      if (error) throw error;

      const map = {};
      data.forEach((item) => {
        if (!map[item.product_id]) map[item.product_id] = 0;
        map[item.product_id] += item.quantity;
      });

      setTotalSoldMap(map);
    } catch (err) {
      console.error("Error fetching total sold from sales:", err);
      setTotalSoldMap({});
    }
  };

  useEffect(() => {
    const channel = supabase
      .channel("products-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, () => {
        loadProducts();
      })
      .subscribe();

    return () => {
      if (supabase.removeChannel) supabase.removeChannel(channel);
      else channel.unsubscribe();
    };
  }, [fetchProducts]);

  useEffect(() => {
    loadProducts();
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setNewProduct({ ...newProduct, imageFile: e.target.files[0] });
    }
  };

  const openProductModal = (product = null) => {
    if (product) setNewProduct({ ...product, imageFile: null });
    else
      setNewProduct({
        id: null,
        name: "",
        description: "",
        cost_price: "",
        price: "",
        stock: "",
        category: "Hair Product",
        weight: "",
        imageFile: null,
        image_url: ""
      });
    setShowProductModal(true);
  };

  const deleteProduct = async (id) => {
    const result = await MySwal.fire({
      icon: "warning",
      title: "Are you sure?",
      text: "Do you want to delete this product?",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it",
      cancelButtonText: "Cancel"
    });
    if (!result.isConfirmed) return;

    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      MySwal.fire({ icon: "error", title: "Failed", text: "Could not delete product." });
    } else {
      await loadProducts();
      MySwal.fire({ icon: "success", title: "Deleted", text: "Product has been deleted." });
    }
  };

  const openStockModal = (product) => {
    setStockProduct(product);
    setStockAmount("");
    setShowStockModal(true);
  };

  const saveStock = async () => {
    if (loadingStockSave) return;
    setLoadingStockSave(true);

    if (!stockAmount || isNaN(stockAmount) || parseInt(stockAmount) <= 0) {
      MySwal.fire({ icon: "error", title: "Invalid Input", text: "Please enter a valid number greater than 0." });
      setLoadingStockSave(false);
      return;
    }

    const newStock = parseInt(stockProduct.stock) + parseInt(stockAmount);

    const { error } = await supabase.from("products").update({ stock: newStock }).eq("id", stockProduct.id);
    if (error) {
      console.error(error);
      MySwal.fire({ icon: "error", title: "Failed", text: "Failed to update stock." });
    } else {
      await sendProductNotification(`📦 Stock updated for "${stockProduct.name}". New stock: ${newStock}`);
      loadProducts();
      MySwal.fire({ icon: "success", title: "Stock Updated", text: `Current stock: ${newStock}` });
      setShowStockModal(false);
    }

    setLoadingStockSave(false);
  };

  const uploadImage = async () => {
    try {
      if (!newProduct.imageFile) return newProduct.image_url;

      const ext = newProduct.imageFile.name.split(".").pop();
      const fileName = `${Date.now()}.${ext}`;
      const filePath = `uploads/${fileName}`;

      const blob = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          resolve(new Blob([reader.result], { type: newProduct.imageFile.type }));
        reader.onerror = reject;
        reader.readAsArrayBuffer(newProduct.imageFile);
      });

      const { error } = await supabase.storage.from("product-images").upload(filePath, blob, { upsert: true });
      if (error) throw error;

      const { data } = supabase.storage.from("product-images").getPublicUrl(filePath);
      return data.publicUrl;
    } catch (error) {
      console.error("Image upload error:", error.message);
      MySwal.fire({ icon: "error", title: "Image Upload Failed", text: error.message });
      return null;
    }
  };

  const saveProduct = async () => {
    if (loadingProductSave) return;
    setLoadingProductSave(true);

    const { id, name, description, cost_price, price, stock, category, weight } = newProduct;
    if (!name || !cost_price || !price || !stock || !category || !weight) {
      MySwal.fire({ icon: "error", title: "Incomplete Data", text: "Please fill all fields." });
      setLoadingProductSave(false);
      return;
    }

    const imageUrl = await uploadImage();
    if (!imageUrl) {
      setLoadingProductSave(false);
      return;
    }

    const payload = { name, description, cost_price: parseFloat(cost_price), price: parseFloat(price), stock: parseInt(stock, 10), category, weight, image_url: imageUrl };

    try {
      let action = "";
      let notifMessage = "";

      if (id) {
        await supabase.from("products").update(payload).eq("id", id);
        action = "updated";
        notifMessage = `✏️ Product "${name}" has been updated.`;
      } else {
        await supabase.from("products").insert([payload]);
        action = "added";
        notifMessage = `🛍️ New product alert! "${name}" is now available with ${stock} in stock.`;
      }

      await sendProductNotification(notifMessage);
      await MySwal.fire({ icon: "success", title: "Success", text: `Product successfully ${action}!` });
      loadProducts();
      setShowProductModal(false);
      setNewProduct({ id: null, name: "", description: "", cost_price: "", price: "", stock: "", category: "Hair Product", weight: "", imageFile: null, image_url: "" });
    } catch (error) {
      console.error(error);
      MySwal.fire({ icon: "error", title: "Error", text: "An unexpected error occurred." });
    } finally {
      setLoadingProductSave(false);
    }
  };

  const handleNumberInput = (e, field) => {
    const value = e.target.value;
    if (/^\d*\.?\d*$/.test(value)) setNewProduct({ ...newProduct, [field]: value });
  };

  // ---------------------- FILTERED PRODUCTS ----------------------
  const filteredProducts = products.filter((p) => {
    let stockCondition = true;
    if (stockFilter === "Low") stockCondition = p.stock <= LOW_STOCK_THRESHOLD;
    else if (stockFilter === "Middle") stockCondition = p.stock > LOW_STOCK_THRESHOLD && p.stock <= HIGH_STOCK_THRESHOLD;
    else if (stockFilter === "High") stockCondition = p.stock > HIGH_STOCK_THRESHOLD;

    let movingCondition = true;
    const totalSold = totalSoldMap[p.id] || 0;
    if (movingFilter === "Fast") movingCondition = totalSold > 50;
    else if (movingFilter === "Mid") movingCondition = totalSold >= 20 && totalSold <= 50;
    else if (movingFilter === "Slow") movingCondition = totalSold < 20;

    return stockCondition && movingCondition;
  });


  // ---------------------- DOWNLOAD PDF ----------------------
  const downloadProductsPDF = () => {
  try {
    const doc = new jsPDF("p", "pt", "a4");
    doc.setFontSize(14);
    doc.text("Products List", 40, 40);

    // ------------------------------
    // 📌 FILTER LABELS IN PDF
    // ------------------------------
    let y = 60;
    doc.setFontSize(10);

    const stockLabel =
      stockFilter !== "All" ? `Stock Filter: ${stockFilter}` : null;
    const movingLabel =
      movingFilter !== "All" ? `Movement Filter: ${movingFilter}` : null;

    if (stockLabel || movingLabel) {
      if (stockLabel) {
        doc.text(stockLabel, 40, y);
        y += 15;
      }
      if (movingLabel) {
        doc.text(movingLabel, 40, y);
        y += 15;
      }
      y += 10; // space before table
    } else {
      y = 60; // no filters used
    }

    // ------------------------------
    // 📌 TABLE DATA
    // ------------------------------
    const tableColumn = [
      "#",
      "Name",
      "Description",
      "Category",
      "Weight",
      "Cost Price",
      "Price",
      "Stock",
      "Total Sold",
    ];

    const tableRows = [];

    filteredProducts.forEach((product, index) => {
      const totalSold = totalSoldMap[product.id] || 0;
      tableRows.push([
        index + 1,
        product.name,
        product.description || "",
        product.category,
        product.weight || "",
        `PHP ${product.cost_price ?? 0}`,
        `PHP ${product.price}`,
        product.stock.toString(),
        totalSold.toString(),
      ]);
    });

    autoTable(doc, {
      head: [tableColumn],
      body: tableRows,
      startY: y,
      styles: {
        fontSize: 10,
        cellPadding: 4,
        overflow: "linebreak",
        valign: "middle",
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 20 },
        1: { cellWidth: 70 },
        2: { cellWidth: 140 },
        3: { cellWidth: 80 },
        4: { cellWidth: 42 },
        5: { cellWidth: 50 },
        6: { cellWidth: 50 },
        7: { cellWidth: 40 },
        8: { cellWidth: 40 },
      },
      headStyles: { fillColor: [76, 175, 80], textColor: 255 },
      tableWidth: "auto",
    });

    doc.save("products.pdf");
  } catch (err) {
    console.error("PDF download error:", err);
    MySwal.fire({
      icon: "error",
      title: "PDF Error",
      text: "Failed to download PDF.",
    });
  }
};



  // ---------------------- RENDER ----------------------
  return (
    <div className="p-4">
      {/* FILTERS & BUTTONS */}
      <div className="flex justify-between mb-4 items-center">
        <h2 className="text-2xl font-bold">📋 Products List</h2>
        <div className="flex gap-2 items-center">
          <select value={stockFilter} onChange={(e) => setStockFilter(e.target.value)} className="border p-2 rounded">
            <option value="All">Stocks</option>
            <option value="Low">Low</option>
            <option value="Middle">Average</option>
            <option value="High">High</option>
          </select>

          <select value={movingFilter} onChange={(e) => setMovingFilter(e.target.value)} className="border p-2 rounded">
            <option value="All">Movement</option>
            <option value="Fast">Fast</option>
            <option value="Mid">Average</option>
            <option value="Slow">Slow</option>
          </select>

          <button className="bg-green-600 text-white px-4 py-2 rounded" onClick={() => openProductModal()}>
            Add Product
          </button>
          <button className="bg-blue-600 text-white px-4 py-2 rounded" onClick={downloadProductsPDF}>
            📄 Download PDF
          </button>
        </div>
      </div>

      {/* LEGEND */}
      <div className="flex flex-wrap gap-3 mb-3 justify-center">
        <span className="px-2 py-1 rounded bg-red-200 text-red-800 font-bold">Low Stock / Slow Sold</span>
        <span className="px-2 py-1 rounded bg-yellow-200 text-yellow-800 font-bold">Average Stock / Average Sold</span>
        <span className="px-2 py-1 rounded bg-green-200 text-green-800 font-bold">High Stock / Fast Sold</span>
      </div>

      {/* PRODUCTS TABLE */}
      {loading ? (
        <div className="p-8 flex items-center justify-center text-gray-600">Loading products...</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg shadow">
          <table className="w-full text-sm border table-fixed text-center">
           <thead className="bg-gray-100">
  <tr>
    <th className="p-2 border w-10">#</th> {/* NEW */}
    <th className="p-2 border w-20">Image</th>
    <th className="p-2 border w-36">Name</th>
    <th className="p-2 border w-64">Description</th>
    <th className="p-2 border w-30">Category</th>
    <th className="p-2 border w-21">Weight</th>
    <th className="p-2 border w-21">Price</th>
    <th className="p-2 border w-21">Stock</th>
    <th className="p-2 border w-21">Total Sold</th>
    <th className="p-2 border w-36">Action</th>
  </tr>
</thead>

         <tbody>
  {filteredProducts.map((p, index) => {
    let stockColor = "";
    if (p.stock <= LOW_STOCK_THRESHOLD) stockColor = "bg-red-200 text-red-800";
    else if (p.stock > LOW_STOCK_THRESHOLD && p.stock <= HIGH_STOCK_THRESHOLD) stockColor = "bg-yellow-200 text-yellow-800";
    else stockColor = "bg-green-200 text-green-800";

    const totalSold = totalSoldMap[p.id] || 0;
    let soldColor = "";
    if (totalSold > 50) soldColor = "bg-green-200 text-green-800";
    else if (totalSold >= 20) soldColor = "bg-yellow-200 text-yellow-800";
    else soldColor = "bg-red-200 text-red-800";

    return (
      <tr key={p.id}>
        <td className="p-2 border">{index + 1}</td> {/* NEW */}
        <td className="p-2 border text-center align-top">
          <img src={p.image_url} alt={p.name} className="w-10 h-10 object-cover rounded mx-auto" />
        </td>
        <td className="p-2 border align-top break-words">{p.name}</td>
        <td className="p-2 border align-top break-words whitespace-normal">{p.description}</td>
        <td className="p-2 border align-top break-words">{p.category}</td>
        <td className="p-2 border align-top">{p.weight}</td>
        <td className="p-2 border align-top">PHP {p.price}</td>
        <td className="p-2 border align-top">
          <span className={`px-2 py-1 rounded font-bold ${stockColor}`}>{p.stock}</span>
        </td>
        <td className="p-2 border align-top">
          <span className={`px-2 py-1 rounded font-bold ${soldColor}`}>{totalSold}</span>
        </td>
        <td className="p-2 border align-middle">
          <div className="flex justify-center items-center gap-2">
            <button title="Add Stock" onClick={() => openStockModal(p)} className="px-2 py-1 bg-green-500 rounded text-white hover:bg-green-600">➕</button>
            <button title="Edit Product" onClick={() => openProductModal(p)} className="px-2 py-1 bg-yellow-400 rounded text-white hover:bg-yellow-500">✏️</button>
            <button title="Delete Product" onClick={() => deleteProduct(p.id)} className="px-2 py-1 bg-red-500 rounded text-white hover:bg-red-600">🗑️</button>
          </div>
        </td>
      </tr>
    );
  })}
</tbody>

          </table>
        </div>
      )}

    

      {/* Product Modal updated with Cost Price field */}
      {showProductModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-md w-96">
            <h3 className="text-lg font-bold mb-4">
              {newProduct.id ? "Edit Product" : "Add Product"}
            </h3>
            <input
              className="border p-2 w-full mb-2"
              placeholder="Name"
              value={newProduct.name}
              onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })}
            />
            <textarea
              className="border p-2 w-full mb-2 h-24 resize-none"
              placeholder="Description"
              value={newProduct.description}
              onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })}
            />
            <input
              type="text"
              inputMode="decimal"
              className="border p-2 w-full mb-2"
              placeholder="Cost Price"
              value={newProduct.cost_price}
              onChange={(e) => handleNumberInput(e, "cost_price")}
            />
            <input
              type="text"
              inputMode="decimal"
              className="border p-2 w-full mb-2"
              placeholder="Price"
              value={newProduct.price}
              onChange={(e) => handleNumberInput(e, "price")}
            />
           {newProduct.id ? (
              <input
                type="text"
                className="border p-2 w-full mb-2 bg-gray-100 text-gray-700"
                value={newProduct.stock}
                readOnly
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                className="border p-2 w-full mb-2"
                placeholder="Stock"
                value={newProduct.stock}
                onChange={(e) => handleNumberInput(e, "stock")}
              />
            )}
            <select
              className="border p-2 w-full mb-2"
              value={newProduct.category}
              onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input
              type="text"
              className="border p-2 w-full mb-3"
              placeholder={`Weight (${newProduct.category === "Perfume" ? "ml" : "g"})`}
              value={newProduct.weight}
              onChange={(e) => setNewProduct({ ...newProduct, weight: e.target.value })}
            />
            <input type="file" onChange={handleFileChange} className="mb-3" />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowProductModal(false)}
                className="px-4 py-2 bg-gray-300 rounded"
                disabled={loadingProductSave}
              >
                Cancel
              </button>
              <button
                onClick={saveProduct}
                className="px-4 py-2 bg-green-600 text-white rounded flex items-center justify-center gap-2"
                disabled={loadingProductSave}
              >
                {loadingProductSave ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

     {/* 🪄 Stock Modal */}
      {showStockModal && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white p-6 rounded shadow-md w-80">
            <h3 className="text-lg font-bold mb-4">
              Add Stock for "{stockProduct?.name}"
            </h3>
            <input
              type="number"
              min="1"
              value={stockAmount}
              onChange={(e) => setStockAmount(e.target.value)}
              className="border p-2 w-full mb-4"
              placeholder="Enter quantity"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowStockModal(false)}
                className="px-4 py-2 bg-gray-300 rounded"
                disabled={loadingStockSave}
              >
                Cancel
              </button>
              <button
                onClick={saveStock}
                className="px-4 py-2 bg-green-600 text-white rounded flex items-center justify-center gap-2"
                disabled={loadingStockSave}
              >
                {loadingStockSave ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spinner CSS */}
      <style>{`
        .loader-border {
          border-top-color: transparent;
        }
      `}</style>
    </div>
  );
}
