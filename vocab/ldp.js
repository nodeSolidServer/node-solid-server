/*
 * Copyright 2014 IBM Corporation.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

function define(name, value) {
    Object.defineProperty(exports, name, {
        value:      value,
        enumerable: true
    });
}

var ns = 'http://www.w3.org/ns/ldp#';
define('ns', ns);
define('prefix', 'ldp');

// Resources
define('Resource', ns + 'Resource');
define('RDFSource', ns + 'RDFSource');
define('Container', ns + 'Container');
define('BasicContainer', ns + 'BasicContainer');
define('DirectContainer', ns + 'DirectContainer');

// Properties
define('contains', ns + 'contains');
define('membershipResource', ns + 'membershipResource');
define('hasMemberRelation', ns + 'hasMemberRelation');
define('isMemberOfRelation', ns + 'isMemberOfRelation');

// Link relations
define('constrainedBy', ns + 'constrainedBy');

// Preferences
define('PreferContainment', ns + 'PreferContainment');
define('PreferMembership', ns + 'PreferMembership');
define('PreferMinimalContainer', ns + 'PreferMinimalContainer');
define('PreferEmptyContainer', ns + 'PreferEmptyContainer');
