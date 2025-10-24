/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        postal: {
          red: "#C01622",     // India Post red
          yellow: "#FFCC00",  // India Post yellow
          ink: "#1F2937",     // dark text
          sheet: "#F8FAFC"    // light background
        }
      },
      boxShadow: {
        card: "0 6px 24px rgba(0,0,0,.06)"
      },
      borderRadius: {
        xl2: "1.25rem"
      }
    }
  },
  plugins: [],
}
