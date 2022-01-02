const express = require("express");
const router = express.Router();

const {
  createFaq,
  getAllFaqs,
  updateFaq,
  deleteFaq,
  getFaqById,
} = require("../../controllers/FaqControllers/faqController");
const {
  protect,
  admin,
  trainer,
  blogger,
  nutrist,
  shopManager,
} = require("../../middlewares/authMiddleware");

router.post(
  "/create",
  //   protect,
  //   grantAccess("updateAny", "challenge"),
  createFaq
);
router.get("/all", getAllFaqs);
router.put(
  "/:faqId",
  //   protect,
  //   grantAccess("updateAny", "challenge"),
  updateFaq
);
router.delete(
  "/:faqId",
  //   protect,
  //   grantAccess("deleteAny", "challenge"),
  deleteFaq
);
router.get(
  "/:faqId",
  //   protect,
  //   grantAccess("deleteAny", "challenge"),
  getFaqById
);

module.exports = router;
