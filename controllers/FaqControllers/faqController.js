const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");

const { Faq } = require("../../models/FaqModel/fagModel");

// @desc    create faq
// @route   POST /api/faq/create
const createFaq = asyncHandler(async (req, res, next) => {
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
    let newFaq = new Faq({
      question: req.body.question,
      answer: req.body.answer,
      category: req.body.category,
      isPublic: req.body.isPublic,
    });

    newFaq = await newFaq.save();
    if (!newFaq) {
      return res.status(400).json("Faq cannot be created!");
    } else {
      return res.status(201).json({
        mesage: "Faq Created Successfully",
        newFaq,
      });
    }
  } catch (err) {
    return next(err);
  }
});

// @desc    Get All faqs
// @route   GET /api/faq/all
const getAllFaqs = asyncHandler(async (req, res) => {
  const faqs = await Faq.find({});
  if (faqs) {
    res.status(200).json({
      faqs,
    });
  } else {
    res.status(404);
    throw new Error("Faqs Cannot be fetched");
  }
});

// @desc    Update Faq by Id
// @route   PUT /api/faq/:faqId
const updateFaq = asyncHandler(async (req, res, next) => {
  try {
    const update = req.body;
    const faqId = req.params.faqId;
    await Faq.findByIdAndUpdate(faqId, update, {
      useFindAndModify: false,
    });
    const faq = await Faq.findById(faqId);
    res.status(200).json({
      data: faq,
      message: "faq has been updated",
    });
  } catch (error) {
    next(error);
  }
});

// @desc    Delete faq
// @route   Delete /api/faq/:faqId
const deleteFaq = asyncHandler(async (req, res) => {
  const faq = await Faq.findById(req.params.faqId);

  if (faq) {
    await faq.remove();
    res.json({ message: "faq removed" });
  } else {
    res.status(404);
    throw new Error("faq not found");
  }
});

// @desc    get  faq by id
// @route   get /api/faq/:faqId
const getFaqById = asyncHandler(async (req, res) => {
  const faq = await Faq.findById(req.params.faqId).populate("category");

  if (faq) {
    res.json({ faq });
  } else {
    res.status(404);
    throw new Error("faq not found");
  }
});

module.exports = {
  createFaq,
  getAllFaqs,
  updateFaq,
  deleteFaq,
  getFaqById,
};
