const { getDatabase } = require("./_lib/checkout-db");
const { sessionUser, requireUser, createSession, destroySession } = require("./_lib/checkout-auth");
const { liveStatus } = require("./_lib/checkout-live");
const { verifyPassword } = require("./_lib/checkout-security");
const { cleanString, httpError } = require("./_lib/checkout-validation");
const service = require("./_lib/checkout-service");

function send(response, status, payload) {
  response.statusCode = status;
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.end(JSON.stringify(payload));
}

function publicUser(user) {
  if (!user) {
    return null;
  }

  return {
    id: Number(user.id),
    username: user.username,
    role: user.role,
    teamId: user.team_id == null ? null : Number(user.team_id),
    teamName: user.team_name,
    displayName: user.display_name
  };
}

function validateRequestOrigin(request) {
  if (request.method === "GET") {
    return;
  }

  const origin = request.headers.origin;
  const host = request.headers.host;

  if (origin && host) {
    const parsed = new URL(origin);

    if (parsed.host !== host) {
      throw httpError(403, "Cross-site requests are not allowed.");
    }
  }
}

async function bodyOf(request) {
  if (request.body && typeof request.body === "object") {
    return request.body;
  }

  if (typeof request.body === "string") {
    return request.body ? JSON.parse(request.body) : {};
  }

  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function handler(request, response) {
  try {
    if (request.method === "OPTIONS") {
      response.statusCode = 204;
      response.end();
      return;
    }

    if (request.method !== "GET" && request.method !== "POST") {
      send(response, 405, { error: "Method not allowed." });
      return;
    }

    validateRequestOrigin(request);
    const body = request.method === "POST" ? await bodyOf(request) : {};
    const action = body.action || request.query && request.query.action || "status";
    const status = liveStatus();

    if (action === "status") {
      send(response, 200, { status });
      return;
    }

    if (!status.live) {
      throw httpError(423, "Hardware checkout is available only while the MakeCU hackathon is live.", { status });
    }

    const database = await getDatabase();

    if (action === "login") {
      const username = cleanString(body.username, "Username", { max: 80 }).toLowerCase();
      const password = cleanString(body.password, "Password", { max: 200 });
      const result = await database.query(
        `SELECT users.*, teams.name AS team_name
           FROM checkout_users users
           LEFT JOIN checkout_teams teams ON teams.id = users.team_id
          WHERE users.username = $1 AND users.active = TRUE`,
        [username]
      );
      const user = result.rows[0];

      if (!user || !(await verifyPassword(password, user.password_hash))) {
        throw httpError(401, "The username or password is incorrect.");
      }

      await createSession(database, response, user.id);
      send(response, 200, { user: publicUser(user) });
      return;
    }

    if (action === "logout") {
      await destroySession(database, request, response);
      send(response, 200, { loggedOut: true });
      return;
    }

    const user = await sessionUser(database, request);

    if (action === "me") {
      send(response, 200, { user: publicUser(requireUser(user)) });
      return;
    }

    if (action === "catalog") {
      requireUser(user);
      send(response, 200, { components: await service.catalog(database, user, user.role === "admin") });
      return;
    }

    if (action === "team-dashboard") {
      send(response, 200, await service.teamDashboard(database, requireUser(user, "team")));
      return;
    }

    if (action === "submit-order") {
      send(response, 201, { order: await service.submitOrder(database, body, requireUser(user, "team")) });
      return;
    }

    if (action === "order") {
      const current = requireUser(user);
      const teamId = current.role === "team" ? current.team_id : null;
      send(response, 200, { order: await service.orderDetails(database, body.orderId, teamId) });
      return;
    }

    const admin = requireUser(user, "admin");

    if (action === "admin-overview") {
      send(response, 200, await service.adminOverview(database));
    } else if (action === "admin-orders") {
      send(response, 200, { orders: await service.adminOrders(database) });
    } else if (action === "claim-order") {
      send(response, 200, { order: await service.claimOrder(database, body, admin) });
    } else if (action === "adjust-order") {
      send(response, 200, { order: await service.adjustOrder(database, body, admin) });
    } else if (action === "mark-ready") {
      send(response, 200, { order: await service.transitionOrder(database, body, admin, "ready") });
    } else if (action === "confirm-pickup") {
      send(response, 200, { order: await service.transitionOrder(database, body, admin, "pickup") });
    } else if (action === "cancel-order") {
      send(response, 200, { order: await service.transitionOrder(database, body, admin, "cancel") });
    } else if (action === "teams") {
      send(response, 200, { teams: await service.teamsList(database, body.search) });
    } else if (action === "team-detail") {
      send(response, 200, await service.teamAdminDetail(database, body.teamId));
    } else if (action === "create-team") {
      send(response, 201, await service.createTeam(database, body, admin));
    } else if (action === "reset-team-password") {
      send(response, 200, await service.resetTeamPassword(database, body, admin));
    } else if (action === "process-return") {
      send(response, 201, await service.processReturn(database, body, admin));
    } else if (action === "save-component") {
      send(response, body.id ? 200 : 201, { component: await service.saveComponent(database, body, admin) });
    } else if (action === "activity") {
      send(response, 200, { activity: await service.activity(database) });
    } else {
      throw httpError(404, "Unknown checkout action.");
    }
  } catch (error) {
    if (error instanceof SyntaxError) {
      send(response, 400, { error: "Request body must be valid JSON." });
      return;
    }

    const status = error.status || 500;

    if (status >= 500) {
      console.error(error);
    }

    send(response, status, {
      error: status >= 500 ? "The checkout system could not complete that action." : error.message,
      details: error.details
    });
  }
}

module.exports = handler;
