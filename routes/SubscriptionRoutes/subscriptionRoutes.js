const express = require("express");
const router = express.Router();

const {
  createCustomer,
  // getAuthCode,
  authorizeApp,
  getAccessToken,
  createPayment,
  createSubscription,
  createFirstPayment,
  getPaymentStatus,
  listSubscriptionPayments,
  updateChallengeOnSubscription,
  getCustomerSubscribtionInformation,
} = require("../../controllers/SubscriptionController/subscriptionController");

router.get("/oauth2/authorize", authorizeApp);
router.get("/payment/status", getPaymentStatus);
router.put("/add/challenges/", updateChallengeOnSubscription);
router.post("/list/subscription/payments", listSubscriptionPayments);
router.get(
  "/subscription/customer/:customerId/",
  getCustomerSubscribtionInformation
);
router.post("/oauth2/authorize", getAccessToken);

router.post("/create/customer", createCustomer);
router.post("/create/payment", createPayment);
router.post("/create/first/payment", createFirstPayment);
router.post("/create/subscription", createSubscription);

// router.put("/:bodyId", updateBody);
// router.get("/:bodyId", getBodyById);
// router.delete("/:bodyId", deleteBody);

module.exports = router;
