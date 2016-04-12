load('../levenshtein.js');
load('../analyze_names.js');
load('names.js');

var console = {'log': function(msg) { debug(msg); }};
var MIN_DISPLAY_RANK = 1;

debug('Total name count: ' + Object.keys(names).length);

function print_results_for_matches(results, exact) {
    var list = [];
    for (var i = 0; i < results.length; i++) {
        if (results[i][1] < MIN_DISPLAY_RANK) {
            continue;
        }
        list.push(results[i][0] + ': ' + results[1][1]);
    }
    debug((exact ? 'Exact' : 'Phonetic') + ' matches: ' + results.length + '\n' +
          list.join(exact ? ', ' : '\n'));
}

function print_results(results) {
    print_results_for_matches(results.exact, true);
    print_results_for_matches(results.phonetic, false);
}

var countries = ['us', 'in', 'si'];
var time = Date.now();
print_results(find_phonetic_matches(names, countries, 'female'));
print_results(find_phonetic_matches(names, countries, 'male'));
time = Date.now() - time;
debug('Took ' + time + 'ms');
