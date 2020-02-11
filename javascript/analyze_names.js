var MIN_RANK = 4;

// names: master list of names. See //python/import_name_databases.py. This generates the
// output in //data/generated/names.json.
// countries: comma separated list countries we'd like to match. e.g. ['in', 'si']
// gender: 'female', 'male', 'unisex'
function find_phonetic_matches(names, countries, gender) {
    var time = Date.now();
    // Convert to set.
    var countries_set = {};
    var i, j, metaphone, name, name_dict, g, country_rankings, c;

    for (i = 0; i < countries.length; i++) {
        countries_set[countries[i]] = true;
    }

    // Invert metaphone mapping.
    // Output: "FJT":{"Vigita":{"unisex":{"in":1,"lk":1}}}
    var metaphone_names = {};
    var num_country_gender_found = 0;
    for (name in names) {
        // We change the name_dict in place and we don't want to change the input 'names'
        // so we clone it.
        name_dict = JSON.parse(JSON.stringify(names[name]));
        if (gender == 'unisex') {
            process_unisex(name_dict, gender);
        }

        var genders = ['male', 'female', 'unisex'];
        for (i = 0; i < genders.length; i++) {
            if (genders[i] != gender) {
                delete name_dict[genders[i]];
            }
        }

        var country_found = false;
        for (g in name_dict) {
            if (g != gender) {
                continue;
            }
            country_rankings = name_dict[g];
            for (c in country_rankings) {
                if (c in countries_set) {
                    country_found = true;
                    break;
                }
            }
        }
        if (!country_found) {
            continue;
        }
        num_country_gender_found++;
        var name_dict_without_metaphone = JSON.parse(JSON.stringify(name_dict));
        delete name_dict_without_metaphone['metaphone'];

        for (i = 0; i < name_dict.metaphone.length; i++) {
            metaphone = name_dict.metaphone[i];
            if (!(metaphone in metaphone_names)) {
                metaphone_names[metaphone] = {};
            }
            metaphone_names[metaphone][name] = name_dict_without_metaphone;
        }
    }
    console.log('Total phonetic name count: ' + Object.keys(metaphone_names).length);
    //console.log('num_country_gender_found: ' + num_country_gender_found);

    // Find phonetic matches.
    //
    // Example entry here:
    // ['FTRN', {"Vedran":{"male":{"ba":5,"hr":5,"si":2},"metaphone":["FTRN"]},
    //           "Vidyaranya":{"male":{"in":3},"metaphone":["FTRN"]}}
    // ]
    var phonetic_matches = [];
    for (metaphone in metaphone_names) {
        var name_map = metaphone_names[metaphone];
        var curr_countries = {};
        var curr_names = {};
        for (name in name_map) {
            name_dict = name_map[name];
            country_rankings = name_dict[gender];
            for (c in country_rankings) {
                if (c in countries_set) {
                    curr_countries[c] = true;
                    curr_names[name] = name_dict;
                }
            }
        }
        if (Object.keys(curr_countries).sort().toString() == countries.sort().toString()) {
            phonetic_matches.push([metaphone, curr_names]);
        }
    }

    // Generate candidates
    var all_candidates = [];
    for (i = 0; i < phonetic_matches.length; i++) {
        metaphone = phonetic_matches[i][0];
        var match = phonetic_matches[i][1];
        // Data is in the format: {"in":[["Vanij",3]],"si":[["Vanja",5],["Vanjo",1]]}
        var country_names = {};
        for (j = 0; j < countries.length; j++) {
            c = countries[j];
            country_names[c] = [];
            for (name in match) {
                name_dict = match[name];
                country_rankings = name_dict[gender];
                if (c in country_rankings) {
                    country_names[c].push([name, country_rankings[c]]);
                }
            }
        }
        var candidates = [];
        var metaphone_candidates = [];
        generate_candidates(country_names, 0, [], metaphone_candidates);
        all_candidates.push.apply(all_candidates, metaphone_candidates);
    }

    // Filter candidates.
    var filtered_candidates = [];
    var candidate_set = {};
    for (i = 0; i < all_candidates.length; i++) {
        c = all_candidates[i];
        key = JSON.stringify(c);
        if (candidate_rank(c, MIN_RANK) >= MIN_RANK) {
            filtered_candidates.push(c);
            candidate_set[key] = true;
        }
    }
    candidate_set = undefined;
    all_candidates = filtered_candidates;
    all_candidates.sort(candidate_sort);
    //console.log('number of filtered candidates: ' + all_candidates.length);

    var returned_names = {};
    var returned_name_lists = {};
    var ret = {'exact': [], 'phonetic': []};
    function return_matches(exact) {
        var i, j, n;

        for (i = 0; i < all_candidates.length; i++) {
            var c = all_candidates[i];
            var curr_names = [];
            for (j = 0; j < c.length; j++) {
                n = c[j][1];
                if (curr_names.indexOf(n) == -1) {
                    curr_names.push(n);
                }
            }
            if ((curr_names.length == 1) != exact) {
                continue;
            }
            rank = candidate_rank(c);
            if (rank < MIN_RANK) {
                break;
            }
            var skip_candidate = false;
            for (j = 0; j < c.length; j++) {
                n = c[j][1];
                if (returned_names[n] > rank) {
                    skip_candidate = true;
                    break;
                }
            }
            if (skip_candidate) {
                continue;
            }
            for (j = 0; j < c.length; j++) {
                n = c[j][1];
                returned_names[n] = rank;
            }
            var name_list = curr_names.join(' / ');
            if (name_list in returned_name_lists) {
                continue;
            }
            returned_name_lists[name_list] = true;
            ret[exact ? 'exact' : 'phonetic'].push([name_list, rank]);
        }
    }

    return_matches(true);
    return_matches(false);
    time = Date.now() - time;
    console.log('Took ' + time + 'ms');
    return ret;
}

// Update name_dict in place by adding an entry for 'unisex' gender.
// Input: {"female":{"us":1},"male":{"us":1},"metaphone":["ATN"]}
// Output: {"female":{"us":1},"male":{"us":1},"metaphone":["ATN"],"unisex":{"us":1}}
function process_unisex(name_dict, gender) {
    if (gender != 'unisex') return;

    // Change the name_dict to only keep the names that show up as both
    // male and female for the same country.
    if (!('female' in name_dict) || !('male' in name_dict)) {
        return;
    }
    var female_countries = Object.keys(name_dict['female']);
    var male_countries = Object.keys(name_dict['male']);
    var country_matches = new Set();
    for (i = 0; i < female_countries.length; i++) {
        var country_female = female_countries[i];
        for (j = 0; j < male_countries.length; j++) {
            var country_male = male_countries[i];
            if (country_female == country_male) {
                country_matches.add(country_female);
            }
        }
    }
    if (country_matches.size == 0) return;

    var new_unisex_map = {}
    for (c in name_dict['female']) {
        if (!country_matches.has(c)) continue;
        new_unisex_map[c] = (name_dict['female'][c] + name_dict['male'][c]) / 2;
    }
    // Add in a value for unisex.
    name_dict['unisex'] = new_unisex_map;
}

function candidate_sort(c1, c2) {
    r1 = candidate_rank(c1);
    r2 = candidate_rank(c2);
    if (r1 == r2) {
        // Sort by name if the rank is the same.
        return c1[0][1].localeCompare(c2[0][1]);
    } else {
        // Sort by rank.
        return r2 - r1;
    }
}

// candidate = [[in,Vijay,7],[si,Voja,1]]
// filter_rank = 4
// Output = 4
//
// candidate: [["in","Rati",3],["si","Rado",5]]
// Output = 10
//
// Algorithm:
// Find the sum of the ranks and calculate the minimum rank value.
// To the rank, add (min_rank - 1) * 3.
// To the new rank subtract (2 * the levenshtein distance between the candidates).
//
// Let's say we have two ranks: x, y
// Output = (x+y) + (min(x,y)-1)*3 - (2 * lev_dist)
function candidate_rank(candidate, filter_rank) {
    var i;
    var rank = 0;
    var min_rank = 13;

    for (i = 0; i < candidate.length; i++) {
        var c = candidate[i];
        rank += c[2];
        min_rank = Math.min(min_rank, c[2]);
    }
    rank += (min_rank - 1) * 3;

    if (filter_rank && rank < filter_rank) {
       return rank;
    }

    var dist_sum = 0;
    for (i = 0; i < candidate.length; i++) {
        var c1 = candidate[i];
        // TODO(surabhi): Can just change this to be j = i;
        for (var j = 0; j < candidate.length; j++) {
            var c2 = candidate[j];
            if (c1[1] != c2[1] && c1[1] > c2[1]) {
                dist_sum += levenshtein(c1[1], c2[1]);
            }
        }
    }
    return rank - (dist_sum * 2);
}

// Recursive function for generating candidates of names. So far, everything is tied to the metaphone,
// but we want to generate all possible combinations of names as candidates.
// For a given metaphone, the first name associated with the first country gets
// added. Then we add subsequent names based on the Levenshtein distance.
// There can be names that are actually pretty far apart but map to the same metaphone.
// We check and make sure the Levenshtein distance is <=2 to keep the name as a candidate.
//
// country_names = {"in":[["Vaijayi",3],["Vijay",7]],"si":[["Voja",1],["Vojo",1],["Vujo",1]]}
// country_index = 0 (recursively increase this)
// current_candidate = []
// all_candidates = []
//
// Using this example, current_candidate has has a list of the potential options
// for the current metaphone:
// [["in","Vaijayi",3]], then [["in","Vijay",7]], then [["in","Vijay",7],["si","Voja",1]]
//
// To all_candidates we add: [["in","Vijay",7],["si","Voja",1]]
function generate_candidates(
        country_names, country_index, current_candidate, all_candidates) {
    // We've gone through all the countries and have generated a full combination of names for each country.
    if (country_index >= Object.keys(country_names).length) {
        all_candidates.push(current_candidate.slice(0));
        return;
    }
    var c = Object.keys(country_names)[country_index];
    for (var i = 0; i < country_names[c].length; i++) {
        var name = country_names[c][i];
        var t = [c, name[0], name[1]];
        var ignore = false;
        for (var j = 0; j < current_candidate.length; j++) {
            if (levenshtein(current_candidate[j][1], name[0]) > 2) {
                ignore = true;
                break;
            }
        }
        if (ignore) {
            continue;
        }
        current_candidate.push(t);
        generate_candidates(country_names, country_index + 1, current_candidate,
                            all_candidates);
        // Remove the last element in the list.
        current_candidate.splice(current_candidate.length - 1, 1);
    }
}

function load_names(callback) {
    var req = new XMLHttpRequest();
    req.addEventListener('load', function(e) {
        names = JSON.parse(req.responseText);
        console.log('Loaded ' + Object.keys(names).length + ' names');
        callback(names);
    });
    req.open('GET', 'data/generated/names.json');
    req.send();
}
