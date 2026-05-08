// deno-lint-ignore-file
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabaseClient.js";
import { v4 as uuidv4 } from "uuid"; // ✅ Import UUID generator
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

export default function AdminSellProducts({ products, fetchProducts }) {
  const [selectedProducts, setSelectedProducts] = useState({});
  const [quantities, setQuantities] = useState({});
  const [showReceipt, setShowReceipt] = useState(false);
  const [receiptItems, setReceiptItems] = useState([]);
  const [transactionInfo, setTransactionInfo] = useState({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadTimeoutRef = useRef(null);

  const loadProducts = async () => {
    if (typeof fetchProducts !== "function") return setLoading(false);
    setLoading(true);
    const start = Date.now();
    try {
      await fetchProducts();
    } catch (err) {
      console.error("fetchProducts error:", err);
      MySwal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to fetch products.",
      });
    } finally {
      const elapsed = Date.now() - start;
      const minVisible = 350; // ms
      const wait = elapsed < minVisible ? minVisible - elapsed : 0;
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
      loadTimeoutRef.current = setTimeout(() => {
        setLoading(false);
        loadTimeoutRef.current = null;
      }, wait);
    }
  };

  const toggleProduct = (productId) => {
    setSelectedProducts((prev) => ({
      ...prev,
      [productId]: !prev[productId],
    }));
  };

  const handleQuantityChange = (productId, value) => {
    if (/^\d*$/.test(value)) {
      setQuantities((prev) => ({
        ...prev,
        [productId]: value,
      }));
    }
  };

  const handleSellClick = () => {
    const selected = Object.keys(selectedProducts)
      .filter((id) => selectedProducts[id])
      .map((id) => {
        const product = products.find((p) => String(p.id) === String(id));
        if (!product) return null;
        const qty = parseInt(quantities[id] || "0");
        if (!qty || qty <= 0) return null;
        return {
          id: product.id,
          name: product.name,
          quantity: qty,
          price: parseFloat(product.price),
          total: parseFloat(product.price) * qty,
        };
      })
      .filter((p) => p !== null);

    if (selected.length === 0) {
      MySwal.fire({
        icon: "warning",
        title: "Oops...",
        text: "Please select at least one product and quantity.",
      });
      return;
    }

    const transactionId = uuidv4();
    const date = new Date().toLocaleString();
    setTransactionInfo({ id: transactionId, date });
    setReceiptItems(selected);
    setShowReceipt(true);
  };

  const confirmSale = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    // Show SweetAlert loading
    MySwal.fire({
      title: "Processing Sale...",
      allowOutsideClick: false,
      didOpen: () => {
        MySwal.showLoading();
      },
    });

    try {
      const saleRows = receiptItems.map((item) => ({
        transaction_id: transactionInfo.id,
        sold_by: "On Store",
        product_id: item.id,
        product_name: item.name,
        quantity: item.quantity,
        price: item.price,
        total: item.total,
        payment_method: "Cash",
        date: new Date().toISOString(),
      }));

      const { error: insertError } = await supabase.from("sales").insert(saleRows);

      if (insertError) {
        console.error("Error inserting sales:", insertError);
        MySwal.fire({
          icon: "error",
          title: "Failed",
          text: "Failed to record in sales. Stock was not updated.",
        });
        return;
      }

      for (const item of receiptItems) {
        const product = products.find((p) => String(p.id) === String(item.id));
        if (!product) continue;

        const newStock = product.stock - item.quantity;
        if (newStock < 0) {
          MySwal.fire({
            icon: "warning",
            title: "Insufficient Stock",
            text: `Not enough stock for ${product.name}.`,
          });
          continue;
        }

        const { error: stockError } = await supabase
          .from("products")
          .update({ stock: newStock })
          .eq("id", product.id);

        if (stockError) {
          console.error("Error updating stock:", stockError);
          MySwal.fire({
            icon: "error",
            title: "Stock Update Failed",
            text: `Failed to update stock for ${product.name}.`,
          });
        }
      }

      MySwal.fire({
        icon: "success",
        title: "Sale Confirmed",
        text: "✅ Sale confirmed and recorded successfully!",
      });

      // Reset states
      loadProducts();
      setSelectedProducts({});
      setQuantities({});
      setShowReceipt(false);
    } catch (error) {
      console.error("Error confirming sale:", error);
      MySwal.fire({
        icon: "error",
        title: "Error",
        text: "Something went wrong. Please try again.",
      });
    } finally {
      setIsProcessing(false);
      MySwal.close();
    }
  };

  const cancelSale = () => {
    if (isProcessing) return;
    setShowReceipt(false);
  };

  useEffect(() => {
    loadProducts();
    return () => {
      if (loadTimeoutRef.current) clearTimeout(loadTimeoutRef.current);
    };
  }, []);

  return (
    <div className="p-4">
      <div className="flex justify-between mb-4">
        <h2 className="text-2xl font-bold">🛒 Sell Products</h2>
      </div>

      {loading ? (
        <div className="p-8 flex items-center justify-center text-gray-600">
          Loading products...
        </div>
      ) : (
        <div className="overflow-x-auto border rounded-lg shadow">
          <table className="w-full text-sm border table-fixed">
            <thead className="bg-gray-100">
              <tr>
                <th className="p-2 border w-10 text-center">✔</th>
                <th className="p-2 border w-20">Image</th>
                <th className="p-2 border w-36">Name</th>
                <th className="p-2 border w-64">Description</th>
                <th className="p-2 border w-32">Category</th>
                <th className="p-2 border w-24">Price</th>
                <th className="p-2 border w-24">Stock</th>
                <th className="p-2 border w-32">Quantity to Sell</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="p-2 border text-center">
                    <input
                      type="checkbox"
                      checked={!!selectedProducts[p.id]}
                      onChange={() => toggleProduct(p.id)}
                    />
                  </td>
                  <td className="p-2 border text-center align-top">
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-10 h-10 object-cover rounded mx-auto"
                    />
                  </td>
                  <td className="p-2 border align-top break-words">{p.name}</td>
                  <td className="p-2 border align-top break-words whitespace-normal">
                    {p.description}
                  </td>
                  <td className="p-2 border align-top break-words">{p.category}</td>
                  <td className="p-2 border align-top">₱ {p.price}</td>
                  <td className="p-2 border align-top">{p.stock}</td>
                  <td className="p-2 border text-center">
                    <input
                      type="text"
                      inputMode="numeric"
                      className="border p-1 w-20 text-center rounded"
                      value={quantities[p.id] || ""}
                      onChange={(e) => handleQuantityChange(p.id, e.target.value)}
                      disabled={!selectedProducts[p.id]}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex justify-end mt-4">
        <button
          onClick={handleSellClick}
          className="px-6 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
        >
          💰 Sell Now
        </button>
      </div>

      {showReceipt && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-40 z-50">
          <div className="bg-white rounded-lg shadow-lg p-6 w-[400px]">
            <h2 className="text-center text-2xl font-bold mb-2">🛍️ Menstribe Shop</h2>
            <p className="text-center text-sm text-gray-600 mb-4">
              Official Sales Receipt
            </p>
            <p><strong>Transaction ID:</strong> {transactionInfo.id}</p>
            <p><strong>Date:</strong> {transactionInfo.date}</p>
            <hr className="my-3" />

            <table className="w-full text-sm border mb-4">
              <thead>
                <tr className="bg-gray-100">
                  <th className="p-2 border text-left">Product</th>
                  <th className="p-2 border text-center">Qty</th>
                  <th className="p-2 border text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {receiptItems.map((item) => (
                  <tr key={item.id}>
                    <td className="p-2 border">{item.name}</td>
                    <td className="p-2 border text-center">{item.quantity}</td>
                    <td className="p-2 border text-right">₱ {item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="text-right font-bold mb-4">
              Total: ₱
              {receiptItems.reduce((sum, i) => sum + i.total, 0).toFixed(2)}
            </div>

            <div className="flex justify-center gap-3 mt-6">
              <button
                onClick={cancelSale}
                className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500 disabled:opacity-50"
                disabled={isProcessing}
              >
                Cancel
              </button>
              <button
                onClick={confirmSale}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                disabled={isProcessing}
              >
                {isProcessing ? "Processing..." : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
