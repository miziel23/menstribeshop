// deno-lint-ignore-file
// pages/AdminDiscounts.jsx
import React, { useState, useEffect } from "react";
import { supabase } from "../lib/supabaseClient.js";
import {
  Percent,
  PlusCircle,
  Clock,
  CheckCircle,
  XCircle,
  Trash2,
  Power,
} from "lucide-react";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";

const MySwal = withReactContent(Swal);

const AdminDiscounts = () => {
  const [discounts, setDiscounts] = useState([]);
  const [products, setProducts] = useState([]);
  const [showModal, setShowModal] = useState(false);

  // Form states
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [discountType, setDiscountType] = useState("percentage");
  const [discountValue, setDiscountValue] = useState("");
  const [reason, setReason] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchDiscounts();
  }, []);

  // Fetch all products
  const fetchProducts = async () => {
    const { data, error } = await supabase.from("products").select("id, name, price");
    if (error) console.error(error);
    else setProducts(data);
  };

  // Fetch discounts + auto update is_active
  const fetchDiscounts = async () => {
    const { data, error } = await supabase
      .from("discounts")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Discount fetch error:", error);
      return;
    }

    const now = new Date();

    const updatedData = await Promise.all(
      data.map(async (d) => {
        const start = new Date(d.start_date);
        const end = new Date(d.end_date);
        const shouldBeActive = now >= start && now <= end;

        if (d.is_active !== shouldBeActive) {
          await supabase.from("discounts").update({ is_active: shouldBeActive }).eq("id", d.id);
          return { ...d, is_active: shouldBeActive };
        }
        return d;
      })
    );

    setDiscounts(updatedData);
  };

  // Toggle activation manually
  const handleToggleActive = async (id, currentStatus) => {
    const newStatus = !currentStatus;
    const { error } = await supabase.from("discounts").update({ is_active: newStatus }).eq("id", id);

    if (error) {
      MySwal.fire({
        icon: "error",
        title: "Oops...",
        text: "Failed to update status: " + error.message,
      });
      return;
    }

    setDiscounts((prev) =>
      prev.map((d) => (d.id === id ? { ...d, is_active: newStatus } : d))
    );

    MySwal.fire({
      icon: "success",
      title: newStatus ? "Activated" : "Deactivated",
      text: `Discount ${newStatus ? "activated" : "deactivated"} successfully.`,
      timer: 2000,
      showConfirmButton: false,
    });
  };

  // Create a discount
  const createDiscount = async () => {
    if (selectedProducts.length === 0 || !discountValue || !startDate || !endDate || !reason) {
      MySwal.fire({
        icon: "warning",
        title: "Incomplete Fields",
        text: "Please fill out all fields and select at least one product.",
      });
      return;
    }

    setLoading(true);
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    const isActive = now >= start && now <= end;

    const { error } = await supabase.from("discounts").insert(
      selectedProducts.map((prodId) => ({
        product_id: prodId,
        discount_type: discountType,
        discount_value: parseFloat(discountValue),
        start_date: startDate,
        end_date: endDate,
        reason,
        is_active: isActive,
      }))
    );
    setLoading(false);

    if (error) {
      MySwal.fire({
        icon: "error",
        title: "Error",
        text: error.message,
      });
    } else {
      MySwal.fire({
        icon: "success",
        title: "Discount Created",
        text: "Discount(s) created successfully!",
        timer: 2000,
        showConfirmButton: false,
      });
      setShowModal(false);
      resetForm();
      fetchDiscounts();
    }
  };

  const resetForm = () => {
    setSelectedProducts([]);
    setDiscountType("percentage");
    setDiscountValue("");
    setStartDate("");
    setEndDate("");
    setReason("");
  };

  // Delete discount
  const deleteDiscount = async (id) => {
    const result = await MySwal.fire({
      icon: "warning",
      title: "Delete Discount?",
      text: "This action cannot be undone.",
      showCancelButton: true,
      confirmButtonText: "Yes, delete it!",
      cancelButtonText: "Cancel",
    });

    if (!result.isConfirmed) return;

    const { error } = await supabase.from("discounts").delete().eq("id", id);
    if (error) {
      MySwal.fire({ icon: "error", title: "Error", text: error.message });
    } else {
      setDiscounts((prev) => prev.filter((d) => d.id !== id));
      MySwal.fire({
        icon: "success",
        title: "Deleted",
        text: "Discount deleted successfully.",
        timer: 2000,
        showConfirmButton: false,
      });
    }
  };

  const getStatus = (d) => {
    const now = new Date();
    const start = new Date(d.start_date);
    const end = new Date(d.end_date);
    if (now < start) return "Upcoming";
    if (now > end) return "Expired";
    return d.is_active ? "Active" : "Inactive";
  };

  const stats = {
    total: discounts.length,
    active: discounts.filter((d) => d.is_active).length,
    upcoming: discounts.filter((d) => getStatus(d) === "Upcoming").length,
    expired: discounts.filter((d) => getStatus(d) === "Expired").length,
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          🏷️ Discount Management
        </h2>
        <button
          onClick={() => setShowModal(true)}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
        >
          <PlusCircle size={18} /> New Discount
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid md:grid-cols-4 sm:grid-cols-2 gap-4">
        <div className="bg-white shadow rounded-xl p-4 border-l-4 border-green-500">
          <h3 className="text-gray-500 text-sm">Total Discounts</h3>
          <p className="text-2xl font-bold">{stats.total}</p>
        </div>
        <div className="bg-white shadow rounded-xl p-4 border-l-4 border-blue-500">
          <h3 className="text-gray-500 text-sm">Active</h3>
          <p className="text-2xl font-bold">{stats.active}</p>
        </div>
        <div className="bg-white shadow rounded-xl p-4 border-l-4 border-yellow-500">
          <h3 className="text-gray-500 text-sm">Upcoming</h3>
          <p className="text-2xl font-bold">{stats.upcoming}</p>
        </div>
        <div className="bg-white shadow rounded-xl p-4 border-l-4 border-red-500">
          <h3 className="text-gray-500 text-sm">Expired</h3>
          <p className="text-2xl font-bold">{stats.expired}</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white shadow rounded-xl p-5">
        <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
          <Percent className="text-gray-600" /> Discounts List
        </h3>

        {discounts.length === 0 ? (
          <p className="text-gray-500">No discounts found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm border">
              <thead className="bg-gray-100">
                <tr>
                  <th className="p-3 border">Product</th>
                  <th className="p-3 border">Type</th>
                  <th className="p-3 border">Value</th>
                  <th className="p-3 border">Reason</th>
                  <th className="p-3 border">Start (Date & Time)</th>
                  <th className="p-3 border">End (Date & Time)</th>
                  <th className="p-3 border">Status</th>
                  <th className="p-3 border">Action</th>
                </tr>
              </thead>
              <tbody>
                {discounts.map((d) => {
                  const product = products.find((p) => p.id === d.product_id);
                  const status = getStatus(d);
                  return (
                    <tr key={d.id} className="hover:bg-gray-50">
                      <td className="p-3 border">{product?.name || "—"}</td>
                      <td className="p-3 border capitalize">{d.discount_type}</td>
                      <td className="p-3 border">
                        {d.discount_type === "percentage"
                          ? `${d.discount_value}%`
                          : `₱${d.discount_value}`}
                      </td>
                      <td className="p-3 border text-gray-700">{d.reason}</td>
                      <td className="p-3 border">
                        {new Date(d.start_date).toLocaleString()}
                      </td>
                      <td className="p-3 border">
                        {new Date(d.end_date).toLocaleString()}
                      </td>
                      <td className="p-3 border font-semibold">
                        {status === "Active" && (
                          <span className="text-green-600 flex items-center gap-1">
                            <CheckCircle size={14} /> Active
                          </span>
                        )}
                        {status === "Upcoming" && (
                          <span className="text-yellow-600 flex items-center gap-1">
                            <Clock size={14} /> Upcoming
                          </span>
                        )}
                        {status === "Expired" && (
                          <span className="text-red-600 flex items-center gap-1">
                            <XCircle size={14} /> Expired
                          </span>
                        )}
                        {status === "Inactive" && (
                          <span className="text-gray-600 flex items-center gap-1">
                            <Power size={14} /> Inactive
                          </span>
                        )}
                      </td>
                      <td className="p-3 border flex flex-col gap-1">
                        <button
                          onClick={() => handleToggleActive(d.id, d.is_active)}
                          className={`${
                            d.is_active
                              ? "text-yellow-600 hover:text-yellow-800"
                              : "text-green-600 hover:text-green-800"
                          } flex items-center gap-1`}
                        >
                          <Power size={14} />{" "}
                          {d.is_active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => deleteDiscount(d.id)}
                          className="text-red-600 hover:text-red-800 flex items-center gap-1"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-xl w-full max-w-lg shadow-lg">
            <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
              <PlusCircle className="text-green-600" /> Create Discount
            </h3>

            <div className="space-y-3">
              {/* Product Selection */}
              <div className="border rounded p-2">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selectedProducts.length === products.length}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedProducts(products.map((p) => p.id));
                      else setSelectedProducts([]);
                    }}
                  />
                  <span className="font-medium">Select All</span>
                </label>

                <div className="max-h-40 overflow-y-auto mt-2">
                  {products.map((p) => (
                    <label key={p.id} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(p.id)}
                        onChange={(e) => {
                          if (e.target.checked)
                            setSelectedProducts((prev) => [...prev, p.id]);
                          else
                            setSelectedProducts((prev) =>
                              prev.filter((id) => id !== p.id)
                            );
                        }}
                      />
                      {p.name} (₱{p.price})
                    </label>
                  ))}
                </div>
              </div>

              {/* Discount Type */}
              <select
                value={discountType}
                onChange={(e) => setDiscountType(e.target.value)}
                className="border p-2 rounded w-full"
              >
                <option value="percentage">Percentage (%)</option>
                <option value="fixed">Fixed Amount (₱)</option>
              </select>

              <input
                type="number"
                value={discountValue}
                onChange={(e) => setDiscountValue(e.target.value)}
                placeholder="Discount value"
                className="border p-2 rounded w-full"
              />

              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for discount (e.g., Anniversary Sale)"
                className="border p-2 rounded w-full resize-none"
                rows="2"
              />

              <div className="grid grid-cols-2 gap-3">
                <input
                  type="datetime-local"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border p-2 rounded w-full"
                />
                <input
                  type="datetime-local"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border p-2 rounded w-full"
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 rounded-lg border border-gray-300 hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  onClick={createDiscount}
                  disabled={loading}
                  className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700"
                >
                  {loading ? "Creating..." : "Save Discount"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDiscounts;
