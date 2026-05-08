// pages/AdminPaymentOptions.jsx
// deno-lint-ignore-file
import React, { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import Swal from "sweetalert2";
import withReactContent from "sweetalert2-react-content";
import GCashLogo from "../assets/gcash.png";
import CODLogo from "../assets/COD.png";
import BPILogo from "../assets/BPI.png";

const MySwal = withReactContent(Swal);

export default function AdminPaymentOptions() {
  const [settings, setSettings] = useState({
    gcash_enabled: true,
    cod_enabled: true,
    bpi_enabled: true,
  });
  const [loading, setLoading] = useState(true); // initially true

  // Fetch the payment settings (only one row)
  const fetchPaymentSettings = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("payment_settings")
      .select("*")
      .single();

    if (error) {
      console.error("Error fetching payment settings:", error);
      MySwal.fire({
        icon: "error",
        title: "Error",
        text: "Failed to fetch payment settings. " + error.message,
      });
    } else {
      setSettings(data);
    }
    setLoading(false);
  };

  // Toggle specific payment method
  const toggleSetting = async (key) => {
    setLoading(true);
    const updatedSettings = { ...settings, [key]: !settings[key] };

    const { error } = await supabase
      .from("payment_settings")
      .update(updatedSettings)
      .eq("id", 1);

    if (error) {
      console.error("Error updating payment settings:", error);
      MySwal.fire({
        icon: "error",
        title: "Update Failed",
        text: "Could not update payment settings. " + error.message,
      });
    } else {
      setSettings(updatedSettings);
      MySwal.fire({
        icon: "success",
        title: "Updated",
        text: `${key.replace("_enabled", "")} has been ${
          updatedSettings[key] ? "enabled" : "disabled"
        }.`,
        timer: 2000,
        showConfirmButton: false,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchPaymentSettings();
  }, []);

  // Logo map for easy access
  const logoMap = {
    gcash_enabled: GCashLogo,
    cod_enabled: CODLogo,
    bpi_enabled: BPILogo,
  };

  // ✅ Loading state before showing content
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <p className="text-gray-600 text-lg font-medium">Loading...</p>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <h2 className="text-2xl font-bold text-block-700 mb-6">
        ⚙️ Payment Settings
      </h2>

      <div className="space-y-4">
        {[
          { key: "gcash_enabled", label: "GCash" },
          { key: "cod_enabled", label: "Cash on Delivery" },
          { key: "bpi_enabled", label: "BPI Bank Transfer" },
        ].map(({ key, label }) => (
          <div
            key={key}
            className="flex justify-between items-center bg-white shadow-sm rounded-lg p-4 border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <img
                src={logoMap[key]}
                alt={label}
                className="w-10 h-10 object-contain"
              />
              <span className="text-lg font-medium">{label}</span>
            </div>

            <button
              onClick={() => toggleSetting(key)}
              disabled={loading}
              className={`px-4 py-2 rounded-full text-white font-medium transition ${
                settings[key]
                  ? "bg-green-600 hover:bg-green-700"
                  : "bg-gray-400 hover:bg-gray-500"
              }`}
            >
              {settings[key] ? "Enabled" : "Disabled"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
