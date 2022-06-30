const { createMollieClient } = require("@mollie/api-client");
const asyncHandler = require("express-async-handler");
const { body, validationResult } = require("express-validator");
const {
  ClientCredentials,
  ResourceOwnerPassword,
  AuthorizationCode,
} = require("simple-oauth2");
const {
  CustomerDetails,
} = require("../../models/UserModels/customerDetailsModel");
const { Membership } = require("../../models/MembershipModel/membershipModel");
const { User } = require("../../models/UserModels/userModel");
const dotenv = require("dotenv");
const { Challenges } = require("../../models/ChallengeModels/challengesModel");
const rp = require("request-promise");

const mollieClient = createMollieClient({
  apiKey: "test_T2KdmDqS6gacG8TBpRNbhWqH7pbrcV",
});

const authorizeApp = async (req, res) => {
  const config = {
    client: {
      id: "app_F47JUr8qWSCa4mfsgK898rsQ",
      secret: "7ctU3RKqCTvjzuKz5jeS4ethTj7AKDjc4g5MDbby",
    },
    auth: {
      tokenHost: "https://www.mollie.com/oauth2/authorize",
    },
  };
  const client = new AuthorizationCode(config);

  const authorizationUri = client.authorizeURL({
    redirect_uri: "https://real-challenge-fit.herokuapp.com/",
    scope: "payments.read customers.write customers.read",
    state:
      "$2a$10$qVjB1QgQ8G2Q8VcpdcG.eee7DRObvhpxd1V6SGiXcG.eee7DRObvhpxd1V6SGiXUEHbCihziJEMa",
    response_type: "code",
    approval_prompt: "force",
    locale: "en_US",
  });

  // console.log(authorizationUri);
  let code = authorizationUri.replace("oauth", "oauth2");
  // const tokenParams = {
  //   code: "<code>",
  //   redirect_uri: "http://localhost:3000/callback",
  //   scope: "<scope>",
  // };

  if (authorizationUri) {
    res.redirect(code);
    return;
    // res.status(200).json(code);
  }
};

const getAuthCode = async (req, res) => {
  // https://wonderful-jang-efe0e4.netlify.app/?code=auth_Vu4FN4JyD6t4yc9JCx8SAN7gjbhbr5&state=%242a%2410%24qVjB1QgQ8G2Q8VcpdcG.eee7DRObvhpxd1V6SGiXcG.eee7DRObvhpxd1V6SGiXUEHbCihziJEMa

  console.log("code", req.query.code);
  // console.log("state", req.query.state);
  /** Logic */
  res.json(req.query.code);
};

// const getAuthCode = async (req, res) => {
//   const config = {
//     client: {
//       id: process.env.CLIENT_ID,
//       secret: process.env.CLIENT_SECRET,
//     },
//     auth: {
//       tokenHost: "https://www.mollie.com/oauth2/authorize",
//     },
//   };
//   const client = new AuthorizationCode(config);
//   const authorizationUri = await client.authorizeURL({
//     redirect_uri: process.env.REDIRECT_URL,
//     scope:
//       "payments.read payments.write refunds.read refunds.write customers.read customers.write subscriptions.read subscriptions.write profiles.read profiles.write invoices.read orders.read orders.write organizations.read organizations.write onboarding.read onboarding.write",
//     state:
//       "$2a$10$qVjB1QgQ8G2Q8VcpdcG.eee7DRObvhpxd1V6SGiXcG.eee7DRObvhpxd1V6SGiXUEHbCihziJEMa",
//   });
//   // res.redirect(authorizationUri);
//   // const { code } = req.query;
//   // console.log(code);
//   if (authorizationUri) {
//     res.status(200).json({
//       authorizationUri,
//       // code,
//     });
//   } else {
//     res.status(200).json({
//       message: "error",
//     });
//   }
// };

const createCustomer = async (name, email) => {
  try {
    const customer = await mollieClient.customers.create({
      name: name,
      email: email,
    });
    console.log(customer);
    if (customer) {
      return customer;
    }
    return null;
  } catch (err) {
    console.log(err);
  }
};

const getAccessToken = () => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }

    const config = {
      client: {
        id: "app_F47JUr8qWSCa4mfsgK898rsQ",
        secret: "7ctU3RKqCTvjzuKz5jeS4ethTj7AKDjc4g5MDbby",
      },
      auth: {
        tokenHost: "https://api.mollie.com/oauth2/tokens",
      },
    };
    const client = new AuthorizationCode(config);
    const authCode = req.params.code;
    const accessToken = client.authorizeURL({
      grant_type: "authorization_code",
      code: authCode,
    });

    console.log(accessToken);
  } catch (err) {
    console.log(err);
  }
};

const createPayment = async (
  currency,
  value,
  description,
  redirectUrl,
  custId
) => {
  try {
    const payment = await mollieClient.payments.create({
      amount: {
        currency: currency,
        value: value, // We enforce the correct number of decimals through strings
      },
      description: description, //Sunscription FREE or whatever
      redirectUrl: redirectUrl,
      method: ["ideal", "creditcard", "sofort", "banktransfer"],
      sequenceType: "first",
      customerId: custId,
    });
    if (payment) {
      return payment;
    }
    return null;
  } catch (err) {
    console.log(err);
  }
};

//create first psyment
const createFirstPayment = async (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    console.log("here in sub");
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    //id of user
    let paymentInfo;
    const user = await User.findById(req.body.id);
    console.log(user);
    if (user) {
      const { name, email, currency, value, description, redirectUrl } =
        req.body;
      if (!user.subcriptionId || user.subcriptionId === undefined) {
        let cust = await createCustomer(name, email);
        let { id: mollieId } = await cust;
        if (mollieId) {
          // console.log("Here update user", mollieId);
          const updatedUser = await User.findByIdAndUpdate(
            user._id,
            { mollieId },
            {
              useFindAndModify: false,
              new: true,
            }
          );
          if (updatedUser) {
            console.log("Update User", updatedUser);
            paymentInfo = await createPayment(
              currency,
              value,
              description,
              redirectUrl,
              mollieId
            );
          }
        } else {
          return res.status(400).json({
            message: "Mollie API Error",
          });
        }
        // TODO: Subscription and Recurring Paymemts
      } else {
        console.log("here a;ready subscribed");
        if (user.subcriptionId) {
          return res.status(400).json({
            message:
              "Already Subcribed to Other Package. kindly revoke that subcription first.",
          });
        }

        // paymentInfo = await createPayment(
        //   currency,
        //   value,
        //   description,
        //   redirectUrl,
        //   user.mollieId
        // );
      }
      console.log(paymentInfo);
      //
      if (paymentInfo) {
        res.json(paymentInfo);
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const createSubscription = async (req, res) => {
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    console.log("here in sub");
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    const user = await User.findById(req.body.id);
    if (user.customerDetails.membership) {
      return res.status(400).json({
        message:
          "Already Subcribed to Other Package. kindly revoke that subcription first.",
      });
    } else {
      const subscription = await mollieClient.customers_subscriptions.create({
        customerId: req.body.custId,
        amount: {
          currency: req.body.currency,
          value: req.body.value,
        },
        // times: req.body.times,
        interval: req.body.interval,
        description: req.body.description,
        // webhookUrl: "https://webshop.example.org/subscriptions/webhook/",
      });

      if (subscription) {
        let { id: subId } = subscription;
        if (subId) {
          console.log("Here update user", subId);
          const updatedUser = await User.findByIdAndUpdate(
            req.body.id,
            { subcriptionId: subId },
            {
              useFindAndModify: false,
              new: true,
            }
          );
          // const updatedCustDetails = new

          if (updatedUser) {
            let newMembership = new Membership({
              name: subscription.description,
              isValid: subscription.status,
              startTime: subscription.startDate,
              endTime: subscription.nextPaymentDate,
              price: subscription.amount.value,
              // coupons: req.body.coupons,
            });

            await newMembership.save();

            const updatedCustomerDetails =
              await CustomerDetails.findByIdAndUpdate(
                updatedUser.customerDetails._id,
                { membership: newMembership },
                {
                  useFindAndModify: false,
                  new: true,
                }
              );
            // let customerDetails = new CustomerDetails({
            //   membership: newMembership,
            // });
            // await customerDetails.save();
            // updatedUser.customerDetails = await customerDetails._id;
            // await user.save();

            res.status(200).json({
              message: "Sucessfully Subcribed",
              subscription,
            });
          }
        } else {
          res.status(400).json({
            message: "Cannot be Subcribed",
          });
        }
      }
    }
  } catch (err) {
    console.log(err);
  }
};

const updateChallengeOnSubscription = async (req, res) => {
  console.log("updateChallengeOnSubscription", req.body);
  if (Object.keys(req.body).length === 0) {
    return res.status(500).json("Body fields cannot be empty.");
  }
  try {
    console.log("in try");
    const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    if (!errors.isEmpty()) {
      res.status(422).json({ errors: errors.array() });
      return;
    }
    console.log("breww");
    const { challengeId, userId } = req.body;

    const user = await User.findById(userId).populate("customerDetails");
    console.log("userrrrrrrrrrrrr", user);
    const challenge = await Challenges.findById(challengeId);
    if (user) {
      console.log("here");
      if (challenge.access.includes("FREE")) {
        console.log("free");
        let subscribedChallenges = user.customerDetails.challenges
          ? user.customerDetails.challenges
          : [];
        // check if challenge already exist
        const challengeFound = subscribedChallenges.find(
          (challenge) => challengeId.toString() === challenge.toString()
        );
        console.log("Challnege Found", challengeFound);
        if (!challengeFound) {
          console.log("here");
          subscribedChallenges.push(challengeId);
        }

        const updatedCustomerDetails = await CustomerDetails.findByIdAndUpdate(
          user.customerDetails._id,
          { challenges: subscribedChallenges },
          {
            useFindAndModify: false,
            new: true,
          }
        );
        return res.status(200).json(updatedCustomerDetails);
        // await user.save();
      } else {
        if (user.subcriptionId) {
          let subscribedChallenges = user.customerDetails.challenges
            ? user.customerDetails.challenges
            : [];

          const challengeFound = subscribedChallenges.find(
            (challenge) => challengeId.toString() === challenge.toString()
          );
          console.log("Challnege Found", challengeFound);
          if (!challengeFound) {
            console.log("here");
            subscribedChallenges.push(challengeId);
          }
          const updatedCustomerDetails =
            await CustomerDetails.findByIdAndUpdate(
              user.customerDetails._id,
              { challenges: subscribedChallenges },
              {
                useFindAndModify: false,
                new: true,
              }
            );
          return res.status(200).json(updatedCustomerDetails);
        }
      }
    }
  } catch (err) {
    console.log("errrors", err);
  }
};

const getPaymentStatus = async (req, res) => {
  // if (Object.keys(req.body).length === 0) {
  //   return res.status(500).json("Body fields cannot be empty.");
  // }
  try {
    // console.log("here in sub");
    // const errors = validationResult(req); // Finds the validation errors in this request and wraps them in an object with handy functions

    // if (!errors.isEmpty()) {
    //   res.status(422).json({ errors: errors.array() });
    //   return;
    // }

    const payment = await mollieClient.payments.get("tr_zxRyCM6R8T");
    if (payment) {
      return res.status(200).json({
        messgae: "Payment status fetched successfully!",
        payment,
      });
    } else {
      return res.status(200).json({
        messgae: "Payment status cannot be fetched!",
      });
    }
  } catch (err) {
    console.log(err);
  }
};
const listSubscriptionPayments = async (req, res) => {
  const { subId, custId } = req.body;
  const payment = await mollieClient.customers_subscriptions(subId, {
    customerId: custId,
  });
  if (payment) {
    return res.status(200).json({
      messgae: "Sunscription Payment fetched successfully!",
      payment,
    });
  } else {
    return res.status(200).json({
      messgae: "Payment status cannot be fetched!",
    });
  }
};

const getCustomerSubscribtionInformation = async (req, res) => {
  const { customerId } = req.params;
  const requestOptions = {
    method: "GET",
    uri: `https://api.mollie.com/v2/customers/${customerId}/subscriptions`,
    headers: {
      Accepts: "application/json",
      Authorization: "Bearer test_T2KdmDqS6gacG8TBpRNbhWqH7pbrcV",
    },
  };

  const response = await rp(requestOptions);
  if (response) {
    return res.status(200).json({
      response,
    });
  } else {
    return res.status(200).json({
      messgae: "Unable to get user information",
    });
  }
};

const destroy = asyncHandler(async (req, res, next) => {
  try {
    await Membership.deleteMany({});

    console.log("deletesd");
    res.status(200).send({
      status: "Successfully removed all Membership files",
    });
  } catch (err) {
    console.log(err);
    next(err);
  }
});

module.exports = {
  // getAuthCode,
  authorizeApp,
  createCustomer,
  getAccessToken,
  getAuthCode,
  createPayment,
  createFirstPayment,
  createSubscription,
  getPaymentStatus,
  listSubscriptionPayments,
  updateChallengeOnSubscription,
  getCustomerSubscribtionInformation,
  destroy,
};
