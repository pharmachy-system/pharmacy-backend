const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    stock: {
      type: Number,
      required: true,
      min: 0
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Medicine", medicineSchema);
