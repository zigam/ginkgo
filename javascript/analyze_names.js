var MIN_RANK = 4;

function find_phonetic_matches(names, countries, gender) {
    var time = Date.now();
    // Convert to set.
    var countries_set = {};
    var i, j, metaphone, name, name_dict, g, country_rankings, c;

    for (i = 0; i < countries.length; i++) {
        countries_set[countries[i]] = true;
    }

    // Invert metaphone mapping.
    var metaphone_names = {};
    for (name in names) {
        name_dict = names[name];
        if (!(gender in name_dict)) {
            continue;
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
        for (i = 0; i < name_dict.metaphone.length; i++) {
            metaphone = name_dict.metaphone[i];
            if (!(metaphone in metaphone_names)) {
                metaphone_names[metaphone] = {};
            }
            metaphone_names[metaphone][name] = name_dict;
        }
    }
    //console.log('Total phonetic name count: ' + Object.keys(metaphone_names).length);

    var phonetic_matches = [];
    for (metaphone in metaphone_names) {
        var name_map = metaphone_names[metaphone];
        var curr_countries = {};
        var curr_names = {};
        for (name in name_map) {
            name_dict = name_map[name];
            for (g in name_dict) {
                if (g != gender) {
                    continue;
                }
                country_rankings = name_dict[g];
                for (c in country_rankings) {
                    if (c in countries_set) {
                        curr_countries[c] = true;
                        curr_names[name] = name_dict;
                    }
                }
            }
        }
        if (Object.keys(curr_countries).sort().toString() == countries.sort().toString()) {
            phonetic_matches.push([metaphone, curr_names]);
        }
    }

    var all_candidates = [];
    for (i = 0; i < phonetic_matches.length; i++) {
        metaphone = phonetic_matches[i][0];
        var match = phonetic_matches[i][1];

        var country_names = {};
        for (j = 0; j < countries.length; j++) {
            c = countries[j];
            country_names[c] = [];
            for (name in match) {
                name_dict = match[name];
                for (g in name_dict) {
                    if (g != gender) {
                        continue;
                    }
                    country_rankings = name_dict[g];
                    if (c in country_rankings) {
                        country_names[c].push([name, country_rankings[c]]);
                        break;
                    }
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
            var name_list = curr_names.join(', ');
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

function candidate_rank(candidate, filter_rank) {
    var i;
    var rank = 0;
    var min_rank = 13;

    for (i = 0; i < candidate.length; i++) {
        var c = candidate[i];
        rank += c[2];
        min_rank = Math.min(min_rank, c[2]);
    }
    var max_dist = 0;
    var dist_sum = 0;
    rank += (min_rank - 1) * 3;

    if (filter_rank && rank < filter_rank) {
       return rank;
    }

    for (i = 0; i < candidate.length; i++) {
        var c1 = candidate[i];
        for (var j = 0; j < candidate.length; j++) {
            var c2 = candidate[j];
            if (c1[1] != c2[1] && c1[1] > c2[1]) {
                dist_sum += levenshtein(c1[1], c2[1]);
            }
        }
    }
    return rank - (dist_sum * 2);
}

function generate_candidates(
        country_names, country_index, current_candidate, all_candidates) {
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
            var cct = current_candidate[j];
            if (levenshtein(cct[1], t[1]) > 2) {
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
