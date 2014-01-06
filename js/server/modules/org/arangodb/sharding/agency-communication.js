/*jslint indent: 2, nomen: true, maxlen: 120, regexp: true */
/*global module, require, exports */

////////////////////////////////////////////////////////////////////////////////
/// @brief Agency Communication
///
/// @file
///
/// DISCLAIMER
///
/// Copyright 2013 triagens GmbH, Cologne, Germany
///
/// Licensed under the Apache License, Version 2.0 (the "License");
/// you may not use this file except in compliance with the License.
/// You may obtain a copy of the License at
///
///     http://www.apache.org/licenses/LICENSE-2.0
///
/// Unless required by applicable law or agreed to in writing, software
/// distributed under the License is distributed on an "AS IS" BASIS,
/// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
/// See the License for the specific language governing permissions and
/// limitations under the License.
///
/// Copyright holder is triAGENS GmbH, Cologne, Germany
///
/// @author Michael Hackstein
/// @author Copyright 2013, triAGENS GmbH, Cologne, Germany
////////////////////////////////////////////////////////////////////////////////

// -----------------------------------------------------------------------------
// --SECTION--                                              Agency-Communication
// -----------------------------------------------------------------------------
exports.Communication = function() {
  
  var agency,
    _AgencyWrapper,
    cache,
    splitServerName,
    storeServersInCache,
    storeServerAddressesInCache,
    updateAddresses,
    updatePlan,
    updateTarget,
    DBServers,
    agencyRoutes,
    Target,
    _ = require("underscore");


  _AgencyWrapper = function() {
    var _agency = exports._createAgency();
    var routes = { 
      vision: "Vision/",
      target: "Target/",
      plan: "Plan/",
      current: "Current/",
      fail: "Fail/"
    };
    var stubs = {
      get: function(route, recursive) {
        return _agency.get(route, recursive);
      },
      set: function(route, name, value) {
        return _agency.set(route + "/" + name, value);
      },
      remove: function(route, name) {
        return _agency.remove(route + "/" + name);
      },
      checkVersion: function(route) {
        return false;
      },
      list: function(route) {
        return _agency.list(route).sort();
      }
    };
    var addLevel = function(base, name, route, functions) {
      var newRoute = base.route;
      if (newRoute) {
        newRoute += "/";
      } else {
        newRoute = "";
      }
      newRoute += route;
      var newLevel = {
        route: newRoute
      };
      _.each(functions, function(f) {
        newLevel[f] = stubs[f].bind(null, newLevel.route); 
      });
      base[name] = newLevel;
      return newLevel;
    };
    var target = addLevel(this, "target", "Target");
    addLevel(target, "dbServers", "DBServers", ["get", "set", "remove", "checkVersion"]);
    addLevel(target, "db", "Collections", ["list"]);
    addLevel(target, "coordinators", "Coordinators", ["list", "set", "remove", "checkVersion"]);
    var plan = addLevel(this, "plan", "Plan");
    addLevel(plan, "dbServers", "DBServers", ["get", "checkVersion"]);
    addLevel(plan, "db", "Collections", ["list"]);
    addLevel(plan, "coordinators", "Coordinators", ["list", "checkVersion"]);
    var current = addLevel(this, "current", "Current");
    addLevel(current, "dbServers", "DBServers", ["get", "checkVersion"]);
    addLevel(current, "db", "Collections", ["list"]);
    addLevel(current, "coordinators", "Coordinators", ["list", "checkVersion"]);
    addLevel(current, "registered", "ServersRegistered", ["get", "checkVersion"]);

  }

  agency = new _AgencyWrapper(); 
  agencyRoutes = {
    vision: "Vision/",
    target: "Target/",
    plan: "Plan/",
    current: "Current/",
    fail: "Fail/"
  };


// -----------------------------------------------------------------------------
// --SECTION--                                       Update Wanted Configuration
// -----------------------------------------------------------------------------

  splitServerName = function(route) {
    var splits = route.split("/");
    return splits[splits.length - 1];
  };

  storeServersInCache = function(place, servers) {
    _.each(servers, function(v, k) {
      var pName = splitServerName(k);
      place[pName] = place[pName] || {};
      place[pName].role = "primary";
      if (v !== "none") {
        place[v] = {
          role: "secondary"
        };
        place[pName] = place[pName] || {};
        place[pName].secondary = v;
      }
    });
  };

  storeServerAddressesInCache = function(servers) {
    _.each(servers, function(v, k) {
      var pName = splitServerName(k);
      // Data Servers
      if (cache.wanted[pName]) {
        cache.wanted[pName].address = v;
      }
      if (cache.current[pName]) {
        cache.current[pName].address = v;
      }
      // Coordinators
      /*
      if (cache.wanted[pName]) {
        cache.wanted[pName].address = v;
      }
      */
    });
  };

  updateAddresses = function() {
    if (cache.target && cache.plan && false) {
      var addresses = agency.get(agencyRoutes.current + "ServersRegistered", true);
      storeServerAddressesInCache(addresses);
    }
  };

  updateTarget = function() {
    cache.target = {};
    var servers = agency.target.dbServers.get(true);
    storeServersInCache(cache.target, servers);
    updateAddresses();
  };

  updatePlan = function(force) {
    cache.plan = {};
    var servers = agency.plan.dbServers.get(true);
    storeServersInCache(cache.plan, servers);
    updateAddresses();
  };

// -----------------------------------------------------------------------------
// --SECTION--                                               Configuration Cache
// -----------------------------------------------------------------------------
  cache = {
    getTarget: function() {
      if (!agency.target.dbServers.checkVersion()) {
        updateTarget();
      }
      return this.target;
    },

    getPlan: function() {
      return this.plan;
    }
  };

  //Fill Cache
  //updateTarget();
  updatePlan();

// -----------------------------------------------------------------------------
// --SECTION--                                                            Vision
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// --SECTION--                                                            Target
// -----------------------------------------------------------------------------

  Target = function() {
    var DBServers;
    var Databases;
    var Coordinators;

    var DBServersObject = function() {
      var cache = {};
      var servers;
      var getList = function() {
        if (!agency.target.dbServers.checkVersion()) {
          cache = {};
          servers = agency.target.dbServers.get(true);
          storeServersInCache(cache, servers);
        }
        return cache;
      };
      this.getList = function() {
        return getList();
      };
      this.addPrimary = function(name) {
        return agency.target.dbServers.set(name, "none");
      };
      this.addSecondary = function(name, primaryName) {
        return agency.target.dbServers.set(primaryName, name);
      };
      this.addPair = function(primaryName, secondaryName) {
        return agency.target.dbServers.set(primaryName, secondaryName);
      },
      this.removeServer = function(name) {
        var res = -1;
        _.each(getList(), function(opts, n) {
          if (n === name) {
            // The removed server is a primary
            if (opts.role === "primary") {
              res = agency.target.dbServers.remove(name);
              if (!res) {
                res = -1;
                return;
              }
              if (opts.secondary !== "none") {
                res = agency.target.dbServers.set(opts.secondary, "none");
              }
              return;
            }
          }
          if (opts.role === "primary" && opts.secondary === name) {
            res = agency.target.dbServers.set(n, "none");
            return;
          }
        });
        if (res === -1) {
          //TODO Debug info
          require("internal").print("Trying to remove a server that is not known");
        }
        return res;
      }
    };
    var DatabasesObject = function() {
      this.getList = function() {
        return agency.target.db.list();            
      };
    };
    var CoordinatorsObject = function() {
      this.getList = function() {
        return agency.target.coordinators.list();
      };
      this.add = function(name) {
        return agency.target.coordinators.set(name, true);
      };
      this.remove = function(name) {
        return agency.target.coordinators.remove(name);
      };
    };

    this.DBServers = function() {
      if (!DBServers) {
        DBServers = new DBServersObject();
      }
      return DBServers;
    };

    this.Databases = function() {
      if (!Databases) {
        Databases = new DatabasesObject();
      }
      return Databases;
    };

    this.Coordinators = function() {
      if (!Coordinators) {
        Coordinators = new CoordinatorsObject();
      }
      return Coordinators;
    };

  };

// -----------------------------------------------------------------------------
// --SECTION--                                                              Plan
// -----------------------------------------------------------------------------

  var Plan = function () {
    var DBServers;
    var Databases;
    var Coordinators;

    var DBServersObject = function() {
      var cache = {};
      var servers;
      var getList = function() {
        if (!agency.plan.dbServers.checkVersion()) {
          cache = {};
          servers = agency.plan.dbServers.get(true);
          storeServersInCache(cache, servers);
        }
        return cache;
      };
      this.getList = function() {
        return getList();
      };
    };
    var DatabasesObject = function() {
      this.getList = function() {
        return agency.plan.db.list();            
      };
    };
    var CoordinatorsObject = function() {
      this.getList = function() {
        return agency.plan.coordinators.list();
      };
    };

    this.DBServers = function() {
      if (!DBServers) {
        DBServers = new DBServersObject();
      }
      return DBServers;
    };

    this.Databases = function() {
      if (!Databases) {
        Databases = new DatabasesObject();
      }
      return Databases;
    };

    this.Coordinators = function() {
      if (!Coordinators) {
        Coordinators = new CoordinatorsObject();
      }
      return Coordinators;
    };
  };

// -----------------------------------------------------------------------------
// --SECTION--                                                           Current
// -----------------------------------------------------------------------------

  var Current = function () {
    var DBServers;
    var Databases;
    var Coordinators;

    var DBServersObject = function() {
      var cache = {};
      var servers;
      var getList = function() {
        if (
            !agency.current.dbServers.checkVersion()
            || !agency.current.registered.checkVersion()
          ) {
          cache = {};
          servers = agency.current.dbServers.get(true);
          storeServersInCache(cache, servers);
          var addresses = agency.current.registered.get(true);
          _.each(addresses, function(v, k) {
            var pName = splitServerName(k);
            if (cache[pName]) {
              cache[pName].address = v;
            }
          });
        }
        return cache;
      };
      this.getList = function() {
        return getList();
      };
    };
    var DatabasesObject = function() {
      this.getList = function() {
        return agency.target.db.list();            
      };
    };
    var CoordinatorsObject = function() {
      var cache;
      this.getList = function() {
        if (
            !agency.current.coordinators.checkVersion()
            || !agency.current.registered.checkVersion()
           ) {
          cache = {};
          servers = agency.current.coordinators.list();
          var addresses = agency.current.registered.get(true);
          _.each(addresses, function(v, k) {
            var pName = splitServerName(k);
            if (_.contains(servers, pName)) {
              cache[pName] = v;
            }
          });
        }
        return cache;
      };
    };

    this.DBServers = function() {
      if (!DBServers) {
        DBServers = new DBServersObject();
      }
      return DBServers;
    };

    this.Databases = function() {
      if (!Databases) {
        Databases = new DatabasesObject();
      }
      return Databases;
    };

    this.Coordinators = function() {
      if (!Coordinators) {
        Coordinators = new CoordinatorsObject();
      }
      return Coordinators;
    };

  };
  
// -----------------------------------------------------------------------------
// --SECTION--                                             Global Object binding
// -----------------------------------------------------------------------------

  this.target = new Target();
  this.plan = new Plan();
  this.current = new Current();

}
////////////////////////////////////////////////////////////////////////////////
/// @fn JSF_agency-communication_agency
/// @brief A wrapper around the Agency initialisation
///
/// @FUN{_createAgency()}
///
/// This returns a singleton instance for the agency or creates it.
///
/// @EXAMPLES
///
/// @code
///     agency  = communication._createAgency();
/// @endcode
////////////////////////////////////////////////////////////////////////////////
exports._createAgency = function() {
  var agency;
  if (agency) {
    return agency;
  }
  agency = new ArangoAgency();
  return agency;
};



// -----------------------------------------------------------------------------
// --SECTION--                                                       END-OF-FILE
// -----------------------------------------------------------------------------

/// Local Variables:
/// mode: outline-minor
/// outline-regexp: "/// @brief\\|/// @addtogroup\\|/// @page\\|// --SECTION--\\|/// @\\}\\|/\\*jslint"
/// End:
