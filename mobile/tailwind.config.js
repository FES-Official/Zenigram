module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: { extend: { colors: {
    ink:"#13090D", panel:"#1E1017", surface:"#29131D",
    wine:"#571A30", crimson:"#B82E50", rose:"#F06B85",
    muted:"#A9949C", line:"#432332"
  }}},
  plugins: []
};
