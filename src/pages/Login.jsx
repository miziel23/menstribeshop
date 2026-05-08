// deno-lint-ignore-file
// src/pages/Login.jsx
import React, { useState } from "react";
import { supabase } from "../lib/supabaseClient.js";
import logo from "../assets/menstribe_product_logo.png";
import { AiFillEye, AiFillEyeInvisible } from "react-icons/ai";
import { useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState(""); // ✅ error state
  const navigate = useNavigate();

  const handleLogin = async () => {
    setErrorMessage(""); // clear error on new attempt

    if (!email || !password) {
      setErrorMessage("Please enter your email and password.");
      return;
    }

    setLoading(true);
    try {
      // Supabase sign-in
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;

      // Check role in 'user_roles'
      const { data: roleData, error: roleError } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", data.user.id)
        .single();

      if (roleError) throw roleError;

      if (roleData.role !== "admin") {
        setErrorMessage("You are not authorized as admin.");
        await supabase.auth.signOut();
        setLoading(false);
        return;
      }

      // ✅ Save login info
      localStorage.setItem("user", JSON.stringify(data.user));

      // ✅ Redirect to Dashboard
      navigate("/dashboard");
    } catch (err) {
      console.error(err);
      setErrorMessage(err.message || "Login failed. Please try again.");
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-col justify-center items-center w-1/8 bg-green-50 p-8">
        <div className="bg-white p-10 rounded-2xl shadow-md w-full max-w-md">
          <h2 className="text-3xl font-bold mb-2 text-green-700 text-center">
            Admin Login
          </h2>

          {/* ✅ Error Message Display */}
          {errorMessage && (
            <p className="text-red-600 text-sm text-center mb-4">
              {errorMessage}
            </p>
          )}

          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border p-3 rounded mb-4 focus:outline-green-500"
          />

          <div className="relative mb-6">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border p-3 rounded pr-12 focus:outline-green-500"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-600"
            >
              {showPassword ? (
                <AiFillEyeInvisible size={22} />
              ) : (
                <AiFillEye size={22} />
              )}
            </button>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className={`w-full text-white py-3 rounded-lg transition ${
              loading ? "bg-green-500 cursor-not-allowed" : "bg-green-700 hover:bg-green-800"
            }`}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>
      </div>

      <div className="w-3/4 h-screen flex items-center justify-center bg-white-100">
        <img src={logo} alt="Admin Logo" className="w-45 h-45 object-contain" />
      </div>
    </div>
  );
}
