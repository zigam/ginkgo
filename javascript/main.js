// http://ipinfo.io

var MIN_DISPLAY_RANK = 10;
var names = {};

function get_dropdowns() {
    return document.getElementsByClassName('country_dropdown');
}

function populate_dropdowns(countries) {
    var i;

    cached_selection = JSON.parse(
            window.localStorage.getItem('selected_countries') || '[]');

    var dropdowns = get_dropdowns();
    for (i = 0; i < dropdowns.length; i++) {
        dropdowns[i].addEventListener('change', dropdown_change);
        var j = 0;
        for (var code in countries) {
            var opt = document.createElement('option');
            opt.appendChild(document.createTextNode(countries[code]));
            opt.value = code;
            dropdowns[i].appendChild(opt);
            if (code === cached_selection[i]) {
                opt.selected = true;
            }
        }
    }

    cached_selection = window.localStorage.getItem('selected_gender');
    var gender_select = document.getElementById('gender');
    for (i = 0; i < gender_select.options.length; i++) {
        if (gender_select.options[i].value === cached_selection) {
            gender_select.options[i].selected = true;
        }
    }
    document.getElementById('gender').addEventListener('change', dropdown_change);
}

function dropdown_change() {
    var dropdowns = get_dropdowns();
    var countries = [];
    for (var i = 0; i < dropdowns.length; i++) {
        var d = dropdowns[i];
        var country = d.options[d.selectedIndex].value;
        if (!country) {
            continue;
        }
        if (countries.indexOf(country) == -1) {
            countries.push(country);
        }
    }
    window.localStorage.setItem('selected_countries', JSON.stringify(countries));

    if (countries.length < 2) {
        return;
    }

    var gender_select = document.getElementById('gender');
    var gender = gender_select.options[gender_select.selectedIndex].value;
    window.localStorage.setItem('selected_gender', gender);

    if (gender == 'both') {
        render_matches(countries, 'female');
        render_matches(countries, 'male');
    } else {
        render_matches(countries, gender);
    }
}

function render_matches(countries, gender) {
    window.setTimeout(function() {
        var matches = find_phonetic_matches(names, countries, gender);
        render_results(matches.exact, gender, true);
        render_results(matches.phonetic, gender, false);
    }, 0);
}

function render_results(results, gender, exact) {
    var div_id = 'matches_' + gender;
    var div = document.getElementById(div_id);
    div.style.display = 'none';

    var inner_div_id = div_id + '_' + (exact ? 'exact' : 'phonetic');
    var inner_div = document.getElementById(inner_div_id);
    inner_div.innerHTML = '';

    var first = true;
    for (var i = 0; i < results.length; i++) {
        if (results[i][1] < MIN_DISPLAY_RANK) {
            continue;
        }
        if (!first) {
            var delimiter = exact ? document.createTextNode(', ') : document.createElement('br');
            inner_div.appendChild(delimiter);
        }
        first = false;
        inner_div.appendChild(document.createTextNode(results[i][0]));
    }

    div.style.display = '';
}

function load_data() {
    var req = new XMLHttpRequest();
    req.addEventListener('load', function(e) {
        countries = JSON.parse(req.responseText);
        console.log('Loaded ' + Object.keys(countries).length + ' country data');
        populate_dropdowns(countries);
        load_names(function(n) {
            names = n;
            window.setTimeout(dropdown_change, 0);
        });
    });
    req.open('GET', 'data/generated/countries.json');
    req.send();
}

