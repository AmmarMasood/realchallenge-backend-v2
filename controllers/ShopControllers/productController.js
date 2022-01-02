const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");

const { Product } = require("../../models/ShopModels/productModel");

// @desc    create product
// @route   POST /api/shop/product/create
const createProduct = asyncHandler(async (req, res, next) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    // console.log(req.body);
    let newProduct = new Product({
      name: req.body.name,
      description: req.body.description,
      category: req.body.category,
      price: req.body.price,
      weight: req.body.weight,
      dimensions: req.body.dimensions,
      uploadImages: req.body.uploadImages,
      inStock: req.body.inStock,
    });

    newProduct = await newProduct.save();
    if (!newProduct) {
      return res.status(400).json("Product cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Product Created Successfully",
        newProduct,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get All products
// @route   GET /api/shop/product
const getAllProducts = asyncHandler(async (req, res) => {
  const products = await Product.find({}).populate("category");
  if (products) {
    res.status(200).json({
      products,
    });
  } else {
    res.status(404);
    throw new Error("Tags Cannot be fetched");
  }
});

// @desc    Update Product by Id
// @route   PUT /api/shop/product/:productId
const updateProduct = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const productId = req.params.productId;
    await Product.findByIdAndUpdate(productId, update, {
      useFindAndModify: false,
    });
    const product = await Product.findById(productId);
    res.status(200).json({
      data: product,
      message: "product has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete product
// @route   Delete /api/shop/product/:productId
const deleteProduct = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId);

  if (product) {
    await product.remove();
    res.json({ message: "product removed" });
  } else {
    res.status(404);
    throw new Error("product not found");
  }
});

// @desc    get  product by id
// @route   get /api/shop/product/:productId
const getProductById = asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.productId).populate(
    "category"
  );

  if (product) {
    res.json({ product: product });
  } else {
    res.status(404);
    throw new Error("product not found");
  }
});

module.exports = {
  createProduct,
  getAllProducts,
  updateProduct,
  deleteProduct,
  getProductById,
};
