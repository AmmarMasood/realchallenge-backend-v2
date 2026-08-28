const express = require("express");
const router = express.Router();

const {
  createCustomer,
  // getAuthCode,
  authorizeApp,
  getAccessToken,
  createPayment,
  createSubscription,
  completeOrder,
  handleWebhook,
  cancelSubscription,
  recoverSubscription,
  cancelChallenge,
  swapChallenge,
  getSwapEligibility,
  createFirstPayment,
  getPaymentStatus,
  listSubscriptionPayments,
  updateChallengeOnSubscription,
  getCustomerSubscribtionInformation,
} = require("../../controllers/SubscriptionController/subscriptionController");

const { protect } = require("../../middlewares/authMiddleware");

router.get("/oauth2/authorize", authorizeApp);
router.get("/payment/status", getPaymentStatus);
// Grants challenge access, so it must be authenticated: the controller takes
// the acting user from the token, not from the request body.
router.put("/add/challenges/", protect, updateChallengeOnSubscription);
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
// Fulfilment. Verifies the payment with Mollie before granting anything.
router.post("/complete", protect, completeOrder);
// Called by Mollie, not by a user — no auth. The posted id is only a lookup
// key; the payment itself is re-read from Mollie before anything is granted.
router.post("/webhook", handleWebhook);
// Stops future billing. Access runs to the end of the paid period.
router.post("/subscription/cancel", protect, cancelSubscription);
// Restores billing after a failed payment. Refuses while Mollie is still
// retrying, so a manual payment cannot race an automatic one.
router.post("/subscription/recover", protect, recoverSubscription);

// A just-started plan challenge can be swapped or dropped inside a short window
// (24h, and before any real progress). After that it holds its slot until done.
router.get("/challenge/swap-eligibility", protect, getSwapEligibility);
router.post("/challenge/cancel", protect, cancelChallenge);
router.post("/challenge/swap", protect, swapChallenge);

// router.put("/:bodyId", updateBody);
// router.get("/:bodyId", getBodyById);
// router.delete("/:bodyId", deleteBody);

module.exports = router;
