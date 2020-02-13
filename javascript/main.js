var MIN_DISPLAY_RANK = 0;
var CARET = ' <span class="caret" />';
var DEFAULT_SELECTED_COUNTRIES = ['us', 'in']
var IPINFO_TOKEN = '6f8f0614933022'
var names = {};
var all_countries = {};

function populate_dropdowns(countries) {
    var li = $('<li class="dropdown-remove"><a>' + '(Remove country)' + '</a></li>');
    var divider = $('<li class="dropdown-remove divider"></li>');
    $('.country-dropdown').append(li, divider);

    for (var code in countries) {
        li = $('<li><a>' + countries[code] + '</a></li>');
        li.find('a').data('value', code);
        $('.country-dropdown').append(li);
    }

    var cached_selection = JSON.parse(
            window.localStorage.getItem('selected_countries') || '[]');
    $('.country-dropdown').each(function(i, elt) {
        if (cached_selection.length > i) {
            var code = cached_selection[i];
            var button = $('#' + $(elt).attr('aria-labelledby'));
            button.html(countries[code] + CARET);
            button.data('value', code);
            $(elt).find('.dropdown-remove').show();
        } else {
            $(elt).find('.dropdown-remove').hide();
        }
    });

    cached_selection = window.localStorage.getItem('selected_gender');
    if (!cached_selection) {
        cached_selection = 'female';
    }
    var gender_button = $('#' + $('.gender-dropdown').attr('aria-labelledby'));
    $('.gender-dropdown li a').each(function(i, elt) {
        var gender = $(elt).data('value');
        if (gender === cached_selection) {
            gender_button.html($(elt).text() + CARET);
            gender_button.data('value', gender);
        }
    });

    $(".dropdown li a").click(function(){
        dropdown_change($(this).parents('.dropdown'), $(this));
    });
}

function dropdown_change(dropdown, selected_link) {
    if (selected_link) {
        var text = selected_link.text();
        var value = selected_link.data('value');
        var button = dropdown.find('.dropdown-toggle');
        if (value) {
            button.html(text + CARET);
            button.data('value', value);
            dropdown.find('.dropdown-remove').show();
        } else {
            button.html('(Select country)' + CARET);
            button.removeData();
            dropdown.find('.dropdown-remove').hide();
        }
    }

    var countries = [];
    $('.country-dropdown').each(function(i, elt) {
        var button = $('#' + $(elt).attr('aria-labelledby'));
        country = button.data('value')
        if (country && countries.indexOf(country) == -1) {
          countries.push(country);
        }
    });
    window.localStorage.setItem('selected_countries', JSON.stringify(countries));

    var gender_button = $('#' + $('.gender-dropdown').attr('aria-labelledby'));
    var gender = gender_button.data('value');
    if (gender) {
        window.localStorage.setItem('selected_gender', gender);
    }

    if (gender == 'male' || gender == 'female' || gender == 'unisex') {
        render_matches(countries, gender);
    }
}

function render_matches(countries, gender) {
    $('#progress').show();
    $('#matches_female').hide();
    $('#matches_male').hide();
    $('#matches_unisex').hide();

    if (!countries.length) {
        $('#progress').hide();
        return;
    }
    window.setTimeout(function() {
        var matches = find_phonetic_matches(names, countries, gender);
        $('#progress').hide();
        render_results(matches.exact, gender, countries, true);
        render_results(matches.phonetic, gender, countries, false);
    }, 10);
}

function generate_tooltip(name, gender, countries) {
    var tooltips = [];
    var countries_set = {};
    for (var i = 0; i < countries.length; i++) {
        countries_set[countries[i]] = true;
    }
    tooltips.push('<strong>Name popularity:</strong>');
    var name_variants = name.split(' / ');
    for (var i = 0; i < name_variants.length; i++) {
        var name = $.trim(name_variants[i]);
        tooltips.push('<strong>' + name + '</strong>');
        if (!name || !names[name]) {
            continue;
        }
        if (gender == 'unisex') {
            var male_rankings = names[name]['male'];
            var female_rankings = names[name]['female'];
            var name_countries_set = {}
            for (var c in male_rankings) {
                name_countries_set[c] = true;
            }
            for (var c in female_rankings) {
                name_countries_set[c] = true;
            }
            for (var c in name_countries_set) {
                if (c in countries_set) {
                    tooltips.push(all_countries[c] + ': ' + Math.max(male_rankings[c], female_rankings[c]));
                }
            }

        } else {
            var country_rankings = names[name][gender];
            for (var c in country_rankings) {
                if (c in countries_set) {
                    tooltips.push(all_countries[c] + ': ' + country_rankings[c]);
                }
            }
        }
        if (i < name_variants.length -1 ) {
            tooltips.push('');
        }
    }
    return tooltips.join('<br />');
}

function render_results(results, gender, countries, exact) {
    var div_id = 'matches_' + gender;
    var div = $('#' + div_id);
    div.hide();

    var inner_div_id = div_id + '_' + (exact ? 'exact' : 'phonetic');
    var inner_div = $('#' + inner_div_id);
    inner_div.html('');

    count = 0
    for (var i = 0; i < results.length; i++) {
        if (results[i][1] < MIN_DISPLAY_RANK) {
            continue;
        }
        var span = $('<span class="name" data-toggle="tooltip" data-placement="top" data-html="true">' +
                     results[i][0] + '</span>');
        span.attr('title', generate_tooltip(results[i][0], gender, countries));
        inner_div.append(span);
        count += 1
    }

    var count_div_id = $('#' + inner_div_id + '_count');
    count_div_id.html(count);

    div.show();
    $(function () {
        $('[data-toggle="tooltip"]').tooltip()
    })
}

function load_data() {
    $.getJSON('data/generated/countries.json', function(countries) {
        console.log('Loaded data for ' + Object.keys(countries).length + ' countries');
        all_countries = countries;
        load_names(function(n) {
            names = n;
            window.setTimeout(dropdown_change, 0);

            var selected_countries = JSON.parse(
                window.localStorage.getItem('selected_countries') || '[]');
            if (!selected_countries.length) {
                var jqxhr = $.getJSON('//ipinfo.io?token=' + IPINFO_TOKEN, function(data) {
                    console.log('country', data.country)
                    if (data && data.country && data.country != 'US' &&
                        data.country.toLowerCase() in all_countries) {
                        selected_countries = ['us', data.country.toLowerCase()];
                        store_and_render(selected_countries);
                    } else {
                        selected_countries = DEFAULT_SELECTED_COUNTRIES;
                        store_and_render(selected_countries);
                    }
                });
                jqxhr.fail(function( jqxhr, textStatus, error ) {
                    console.log('Request failed: ' + textStatus + ', ' + error);
                    selected_countries = DEFAULT_SELECTED_COUNTRIES;
                    store_and_render(selected_countries);
                });
            } else {
                store_and_render(selected_countries);
            }
        });
    });
}

function store_and_render(selected_countries) {
    window.localStorage.setItem('selected_countries', JSON.stringify(selected_countries));
    populate_dropdowns(all_countries);
    window.setTimeout(dropdown_change, 0);
}
