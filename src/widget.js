/* -*- mode: js2; js2-basic-offset: 4; indent-tabs-mode: nil -*- */
/* jshint esnext: true */
/* jshint -W097 */
/* jshint multistr: true */
/* global imports: false */
/**
    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 2 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

'use strict';

const St = imports.gi.St;
const PopupMenu = imports.ui.popupMenu;
const Slider = imports.ui.slider;
const Pango = imports.gi.Pango;
const GLib = imports.gi.GLib;
const Clutter = imports.gi.Clutter;
const Gtk = imports.gi.Gtk;
const Gio = imports.gi.Gio;
const Lang = imports.lang;
const Tweener = imports.ui.tweener;
const Gettext = imports.gettext.domain('gnome-shell-extensions-mediaplayer');
const _ = Gettext.gettext;

const Me = imports.misc.extensionUtils.getCurrentExtension();
const Settings = Me.imports.settings;
const Lib = Me.imports.lib;
const DBusIface = Me.imports.dbus;

const BaseContainer = new Lang.Class({
    Name: "BaseContainer",
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function(parms) {
      this.parent(parms);
      //We don't want our BaseContainers to be highlighted when clicked,
      //they're not really menu items in the traditional sense.
      //We want to maintain the illusion that they are normal UI containers,
      //and that our main track UI area is one big container.
      this.actor.add_style_pseudo_class = function() {return null;}
    }
});

const PlayerButtons = new Lang.Class({
    Name: 'PlayerButtons',
    Extends: BaseContainer,

    _init: function() {
        this.parent({hover: false});
        this.box = new St.BoxLayout();
        this.actor.add(this.box, {expand: true, x_fill: false, x_align: St.Align.MIDDLE});
    },
    addButton: function(button) {
        this.box.add_actor(button.actor);
    }
});

const PlayerButton = new Lang.Class({
    Name: "PlayerButton",

    _init: function(icon, callback) {
        let style_class;
        if (Settings.MINOR_VERSION > 19) {
          style_class = 'message-media-control player-button';
        }
        else {
          style_class = 'system-menu-action popup-inactive-menu-item';
        }
        this.icon = new St.Icon({icon_name: icon, icon_size: 16});
        this.actor = new St.Button({style_class: style_class, child: this.icon});
        this.actor._delegate = this;
        this._callback_id = this.actor.connect('clicked', callback);
    },

    setCallback: function(callback) {
        this.actor.disconnect(this._callback_id);
        this._callback_id = this.actor.connect('clicked', callback);
    },

    setIcon: function(icon) {
        this.icon.icon_name = icon;
    },

    enable: function() {
        this.actor.reactive = true;
    },

    disable: function() {
        this.actor.reactive = false;
    },

    show: function() {
        this.actor.show();
    },

    hide: function() {
        this.actor.hide();
    }
});

const SliderItem = new Lang.Class({
    Name: "SliderItem",
    Extends: BaseContainer,

    _init: function(icon, value) {
        this.parent({hover: false});
        this._icon = new St.Icon({style_class: 'popup-menu-icon', icon_name: icon});
        this._slider = new Slider.Slider(value);

        this.actor.add(this._icon);
        this.actor.add(this._slider.actor, {expand: true});
    },

    setReactive: function(reactive) {
        this._slider.actor.reactive = reactive;
    },

    setValue: function(value) {
        this._slider.setValue(value);
    },

    setIcon: function(icon) {
        this._icon.icon_name = icon;
    },

    sliderConnect: function(signal, callback) {
        this._slider.connect(signal, callback);
    }
});

const TrackBox = new Lang.Class({
    Name: "TrackBox",
    Extends: BaseContainer,

    _init: function(cover) {
      this.parent({hover: false});
      this._hidden = false;
      this._cover = cover;      
      this.infos = new St.BoxLayout({vertical: true});
      this._artistLabel = new St.Label({style_class: 'track-info-artist'});
      this._titleLabel = new St.Label({style_class: 'track-info-title'});
      this._albumLabel = new St.Label({style_class: 'track-info-album'});
      this.infos.add(this._artistLabel);
      this.infos.add(this._titleLabel);
      this.infos.add(this._albumLabel);
      this._content = new St.BoxLayout({style_class: 'track-box', vertical: false}); 
      this._content.add(this._cover);
      this._content.add(this.infos);
      this.actor.add(this._content, {expand: true, x_fill: false, x_align: St.Align.MIDDLE});
    },

    updateInfo: function(state) {
      this._artistLabel.text = state.trackArtist;
      if (this._artistLabel.text == "") {
        this._artistLabel.hide();
      }
      else {
        this._artistLabel.show();
      }        
      this._titleLabel.text = state.trackTitle;
      if (this._titleLabel.text == "") {
        this._titleLabel.hide();
      }
      else {
        this._titleLabel.show();
      }
      this._albumLabel.text = state.trackAlbum;
      if (this._albumLabel.text == "") {
        this._albumLabel.hide();
      }
      else {
        this._albumLabel.show();
      }
    },

    get hidden() {
      return this._hidden;
    },

    set hidden(value) {
      this._hidden = value;
    },

    hide: function() {
      this.actor.hide();
      this.actor.opacity = 0;
      this.actor.set_height(0);
      this.hidden = true;
    },

    show: function() {
      this.actor.show();
      this.actor.opacity = 255;
      this.actor.set_height(-1);
      this.hidden = false;
    },

    showAnimate: function() {
      if (!this.actor.get_stage() || !this._hidden)
        return;

      this.actor.set_height(-1);
      let [minHeight, naturalHeight] = this.actor.get_preferred_height(-1);
      this.actor.set_height(0);
      this.actor.show();
      Tweener.addTween(this.actor, {
        opacity: 255,
        height: naturalHeight,
        time: Settings.FADE_ANIMATION_TIME,
        transition: 'easeOutQuad',
        onComplete: function() {
          this.show();
        },
        onCompleteScope: this
      });
    },

    hideAnimate: function() {
      if (!this.actor.get_stage() || this._hidden)
        return;

      Tweener.addTween(this.actor, {
        opacity: 0,
        height: 0,
        time: Settings.FADE_ANIMATION_TIME,
        transition: 'easeOutQuad',
        onComplete: function() {
          this.hide();
        },
        onCompleteScope: this
      });
    }
});

const SecondaryInfo = new Lang.Class({
    Name: "SecondaryInfo",
    Extends: BaseContainer,

    _init: function() {
      this.parent({hover: false, style_class: 'no-padding-bottom'});
      this._hidden = false;     
      this.infos = new St.BoxLayout({vertical: true});
      this._artistLabel = new St.Label({style_class: 'track-info-artist'});
      this._titleLabel = new St.Label({style_class: 'track-info-title'});
      this._albumLabel = new St.Label({style_class: 'track-info-album'});
      this.infos.add(this._artistLabel, {expand: true, x_fill: false, x_align: St.Align.MIDDLE});
      this.infos.add(this._titleLabel, {expand: true, x_fill: false, x_align: St.Align.MIDDLE});
      this.infos.add(this._albumLabel, {expand: true, x_fill: false, x_align: St.Align.MIDDLE});
      this.actor.add(this.infos, {expand: true, x_fill: false, x_align: St.Align.MIDDLE});
    },

    updateInfo: function(state) {
      this._artistLabel.text = state.trackArtist.toString();
      if (this._artistLabel.text == "") {
        this._artistLabel.hide();
      }
      else {
        this._artistLabel.show();
      }        
      this._titleLabel.text = state.trackTitle.toString();
      if (this._titleLabel.text == "") {
        this._titleLabel.hide();
      }
      else {
        this._titleLabel.show();
      }
      this._albumLabel.text = state.trackAlbum.toString();
      if (this._albumLabel.text == "") {
        this._albumLabel.hide();
      }
      else {
        this._albumLabel.show();
      }
    },

    get hidden() {
      return this._hidden;
    },

    set hidden(value) {
      this._hidden = value;
    },

    hide: function() {
      this.actor.hide();
      this.actor.opacity = 0;
      this.actor.set_height(0);
      this.hidden = true;
    },

    show: function() {
      this.actor.show();
      this.actor.opacity = 255;
      this.actor.set_height(-1);
      this.hidden = false;
    },

    showAnimate: function() {
      if (!this.actor.get_stage() || !this._hidden)
        return;

      this.actor.set_height(-1);
      let [minHeight, naturalHeight] = this.actor.get_preferred_height(-1);
      this.actor.set_height(0);
      this.actor.show();
      Tweener.addTween(this.actor, {
        opacity: 255,
        height: naturalHeight,
        time: Settings.FADE_ANIMATION_TIME,
        transition: 'easeOutQuad',
        onComplete: function() {
          this.show();
        },
        onCompleteScope: this
      });
    },

    hideAnimate: function() {
      if (!this.actor.get_stage() || this._hidden)
        return;

      Tweener.addTween(this.actor, {
        opacity: 0,
        height: 0,
        time: Settings.FADE_ANIMATION_TIME,
        transition: 'easeInQuad',
        onComplete: function() {
          this.hide();
        },
        onCompleteScope: this
      });
    }
});

const TrackRating = new Lang.Class({
    Name: "TrackRating",
    Extends: BaseContainer,

    _init: function(player, value) {
        this._player = player;
        this.parent({style_class: "track-rating", hover: false});
        let style_class = 'no-padding';
        if (this._player._pithosRatings) {
          style_class = 'track-box';
        }
        this.box = new St.BoxLayout({style_class: style_class});
        this.actor.add(this.box, {expand: true, x_fill: false, x_align: St.Align.MIDDLE});
        this._applyFunc = null;
        if (this._player._pithosRatings) {
          this._value = null;
          this._isNuvolaPlayer = false;
          this._rhythmbox3Proxy = false;
          this.rate = this._ratePithos;
          this._buildPithosRatings();
        }
        else {
          this._isNuvolaPlayer = this._player.busName.indexOf("org.mpris.MediaPlayer2.NuvolaApp") != -1;
          if (this._isNuvolaPlayer) {
            this._rhythmbox3Proxy = false;
            this._applyFunc = this.applyNuvolaRating;
          }
          else {
            // Supported players (except for Nuvola Player & Pithos)
            let supported = {
                "org.mpris.MediaPlayer2.banshee": this.applyBansheeRating,
                "org.mpris.MediaPlayer2.rhythmbox": this.applyRhythmbox3Rating,
                "org.mpris.MediaPlayer2.guayadeque": this.applyGuayadequeRating,
                "org.mpris.MediaPlayer2.quodlibet": this.applyQuodLibetRating,
                "org.mpris.MediaPlayer2.Lollypop": this.applyLollypopRating
            };
            if (supported[this._player.busName]) {
              this._rhythmbox3Proxy = new DBusIface.RhythmboxRatings();
              this._applyFunc = supported[this._player.busName];
            }
          }
          this.rate = this._rate;
          this._buildStars(value);
        }
    },

    _buildStars: function(value) {
        this._value = Math.min(Math.max(0, value), 5);
        this._starButton = [];
        for(let i=0; i < 5; i++) {
            let icon_name = 'non-starred-symbolic';
            let starred = false;
            if (i < this._value) {
                icon_name = 'starred-symbolic';
                starred = true;
            }
            // Create star icons
            let starIcon = new St.Icon({style_class: 'popup-menu-icon star-icon',
                                             icon_name: icon_name
                                             });
            // Create the button with starred icon
            this._starButton[i] = new St.Button({x_align: St.Align.MIDDLE,
                                                 y_align: St.Align.MIDDLE,
                                                 track_hover: true,
                                                 child: starIcon
                                                });
            this._starButton[i]._rateValue = i + 1;
            this._starButton[i]._starred = starred;
            if (this._applyFunc) {
                this._starButton[i].connect('notify::hover', Lang.bind(this, this.newRating));
                this._starButton[i].connect('clicked', Lang.bind(this, this.applyRating));
            }
            // Put the button in the box
            this.box.add_child(this._starButton[i]);
        }
    },

    _buildPithosRatings: function() {
        this._ratingsIcon = new St.Icon({style_class: 'popup-menu-icon star-icon', icon_size: 12});
        this._unRateButton = new St.Button({child: this._ratingsIcon});
        this.box.add(this._unRateButton);
        this._loveButton = new St.Button();
        this.box.add(this._loveButton);
        this._banButton = new St.Button();
        this.box.add(this._banButton);
        this._tiredButton = new St.Button();
        this.box.add(this._tiredButton);
        this._loveButton.label = _("Love");
        this._banButton.label = _("Ban");
        this._tiredButton.label = _("Tired");
        this._callbackId = 0;
        this._unRateButton.connect('clicked', Lang.bind(this, function() {
            this._player._pithosRatings.UnRateSongRemote(this._player.state.trackObj);
        }));
        this._banButton.connect('clicked', Lang.bind(this, function() {
            this._player._pithosRatings.BanSongRemote(this._player.state.trackObj);
        }));
        this._tiredButton.connect('clicked', Lang.bind(this, function() {
            this._player._pithosRatings.TiredSongRemote(this._player.state.trackObj);
        }));
        this._unRateButton.hide();
        this.box.set_width(-1);
    },

    newRating: function(button) {
        if (!this._isNuvolaPlayer || this.player._mediaServerPlayer.NuvolaCanRate) {
            if (button.hover) {
                this.hoverRating(button._rateValue);
            }
            else {
                this.rate(this._value);
            }
        }
    },

    hoverRating: function(value) {
        for (let i = 0; i < 5; i++) {
            let icon_name = 'non-starred-symbolic';
            if (i < value) {
                icon_name = 'starred-symbolic';
            }
            this._starButton[i].child.icon_name = icon_name;
        }
    },

    _ratePithos: function(rating) {
        if (this._value == rating) {
          return;
        }
         if (this._callbackId!== 0) {
             this._loveButton.disconnect(this._callbackId);
         }
         // Tired or banned song won't show up in the trackbox,
         // and if a song is banned or set tired it will be skipped automatically.
         // Pithos doesn't even send metadata updates for the current song if it's banned or set tired.
         // The only ratings we need to worry about are unrated and loved.
         if (rating == '') {
             this._ratingsIcon.icon_name = null;
             this._unRateButton.hide();
             this._loveButton.label = _("Love");
             this._callbackId = this._loveButton.connect('clicked', Lang.bind(this, function() {
                 this._player._pithosRatings.LoveSongRemote(this._player.state.trackObj);
             }));
         }
         else if (rating == 'love') {
             this._ratingsIcon.icon_name = 'emblem-favorite-symbolic'
             this._unRateButton.show();
             this._loveButton.label = _("UnLove");
             this._callbackId = this._loveButton.connect('clicked', Lang.bind(this, function() {
                 this._player._pithosRatings.UnRateSongRemote(this._player.state.trackObj);
             }));
         }
         this._value = rating;
         this.box.set_width(-1);      
    },

    _rate: function(value) {
        value = Math.min(Math.max(0, value), 5);
        for (let i = 0; i < 5; i++) {
            let icon_name = 'non-starred-symbolic';
            let starred = false;
            if (i < value) {
                icon_name = 'starred-symbolic';
                starred = true;
            }
            this._starButton[i].child.icon_name = icon_name;
            this._starButton[i]._starred = starred;
        }
        this._value = value;
    },

    applyRating: function(button) {
        let rateValue;
        // Click on a already starred icon, unrates
        if (button._starred && button._rateValue == this._value) {
            rateValue = 0;
        }
        else {
            rateValue = button._rateValue;
        }
        // Apply the rating in the player
        let applied = this._applyFunc(rateValue);
        if (applied) {
            this.rate(rateValue);
        }
    },

    applyBansheeRating: function(value) {
        GLib.spawn_command_line_async("banshee --set-rating=%s".format(value));
        return true;
    },

    applyGuayadequeRating: function(value) {
        GLib.spawn_command_line_async("guayadeque --set-rating=%s".format(value));
        return true;
    },

    applyQuodLibetRating: function(value) {
        // Quod Libet works on 0.0 to 1.0 scores
        GLib.spawn_command_line_async("quodlibet --set-rating=%f".format(value / 5.0));
        return true;
    },

    applyLollypopRating: function(value) {
        GLib.spawn_command_line_async("lollypop --set-rating=%s".format(value));
        return true;
    },

    applyRhythmbox3Rating: function(value) {
        if (this._rhythmbox3Proxy && this._player.state.trackUrl) {
            this._rhythmbox3Proxy.SetEntryPropertiesRemote(this._player.state.trackUrl,
                                                           {rating: GLib.Variant.new_double(value)});
            return true;
        }

        return false;
    },
    
    applyNuvolaRating: function(value) {
        if (this.player._mediaServerPlayer.NuvolaCanRate) {
            this.player._mediaServerPlayer.NuvolaSetRatingRemote(value / 5.0);
            return true;
        }
        return false;
    },
});

const ListSubMenu = new Lang.Class({
  Name: 'ListSubMenu',
  Extends: PopupMenu.PopupSubMenuMenuItem,

  _init: function(label) {
    this.parent(label, false);
    this.activeObject = null;
    this._hidden = false;
    //We have to MonkeyPatch open and close
    //So our nested menus don't close their parent menu
    //and to completely disable animation.
    this.menu.close = Lang.bind(this, this.close);
    this.menu.open = Lang.bind(this, this.open);
  },

  close: function(animate) {
    if (!this.menu.isOpen) {
      return;
    }
    this.menu.isOpen = false;
    if (this.menu._activeMenuItem) {
      this.menu._activeMenuItem.setActive(false);
    }
    this.menu.actor.hide();
    this.menu._arrow.rotation_angle_z = 0;
  },


  open: function(animate) {
    if (this.menu.isOpen || this._hidden || this.menu.isEmpty()) {
      return;
    }
    this.menu.isOpen = true;
    this.emit('ListSubMenu-opened');
    this.menu.actor.show();
    this.updateScrollbarPolicy();
    this.menu._arrow.rotation_angle_z = this.menu.actor.text_direction == Clutter.TextDirection.RTL ? -90 : 90;   
  },

  show: function() {
    this._hidden = false;
    this.actor.show();
  },

  hide: function() {
    this._hidden = true;
    this.close();
    this.actor.hide();
  },

  setScrollbarPolicyAllways: function() {
    this.menu.actor.vscrollbar_policy = Gtk.PolicyType.ALWAYS;
  },

  updateScrollbarPolicy: function(adjustment) {
    if (!this.menu.isOpen) {
      return;
    }
    this.menu.actor.vscrollbar_policy = Gtk.PolicyType.NEVER; 
    let goingToNeedScrollbar = this.needsScrollbar(adjustment);
    this.menu.actor.vscrollbar_policy = 
      goingToNeedScrollbar ? Gtk.PolicyType.ALWAYS : Gtk.PolicyType.NEVER;

    if (goingToNeedScrollbar) {
      this.menu.actor.add_style_pseudo_class('scrolled');
    }
    else {
      this.menu.actor.remove_style_pseudo_class('scrolled');
    }
  },

  needsScrollbar: function(adjustment) {
    //GNOME Shell is really bad at deciding when to reserve space for a scrollbar...
    //This is a reimplementation of:
    //https://github.com/GNOME/gnome-shell/blob/30e17036e8bec8dd47f68eb6b1d3cfe3ca037caf/js/ui/popupMenu.js#L925
    //That takes an optional adjustment value to see if we're going to need a scrollbar in the future.
    //It's not perfect but it works better than the default implementation for our purposes.
    if (!adjustment) {
      adjustment = 0;
    }
    let topMenu = this._getTopMenu();
    let [topMinHeight, topNaturalHeight] = topMenu.actor.get_preferred_height(-1);
    let topThemeNode = topMenu.actor.get_theme_node();
    let topMaxHeight = topThemeNode.get_max_height();
    return topMaxHeight >= 0 && topNaturalHeight + adjustment > topMaxHeight;
  },

  setObjectActive: function(objPath) {
    this.activeObject = objPath;
    this.menu._getMenuItems().forEach(function(listItem) {
      if (listItem.obj == objPath) {
        listItem.setOrnament(PopupMenu.Ornament.DOT);
      }
      else {
        listItem.setOrnament(PopupMenu.Ornament.NONE);
      }
    });
  },
  
  getItem: function(obj) {        
    let menuItems = this.menu._getMenuItems().filter(function(item) {
        return item.obj === obj;  
    });
    if (menuItems && menuItems[0]) {
      return menuItems[0];
    }
    else {
      return null;
    }
  },

  hasUniqueObjPaths: function(objects, isTracklistMetadata) {
    //Check for unique values in the playlist and tracklist object paths.
    let unique = objects.reduce(function(values, object) {
      if (isTracklistMetadata) {
        object = object["mpris:trackid"] ? object["mpris:trackid"].unpack() : "/org/mpris/MediaPlayer2/TrackList/NoTrack";
      }
      else {
        object = object[0];
      }
      values[object] = true;
      return values;
    }, {});
    return Object.keys(unique).length === objects.length;
  }

});

const TrackList = new Lang.Class({
    Name: "Tracklist",
    Extends: ListSubMenu,

  _init: function(label, player) {
    this.parent(label);
    this.player = player;
    this.parseMetadata = Lib.parseMetadata;
  },

  showRatings: function(value) {
    this.setScrollbarPolicyAllways();
    this.menu._getMenuItems().forEach(function(tracklistItem) {
      tracklistItem.showRatings(value);
    });
    this.updateScrollbarPolicy();
  },

  updateMetadata: function(UpdatedMetadata) {
    let metadata = {};
    this.parseMetadata(UpdatedMetadata, metadata);
    let trackListItem = this.getItem(metadata.trackObj);
    if (trackListItem) {
      trackListItem.updateMetadata(metadata);
    }
  },

  loadTracklist: function(trackListMetaData, showRatings) {
    this.menu.removeAll();
    //As per spec all object paths MUST be unique.
    //If we don't have unique object paths reject the whole array.
    let hasUniqueObjPaths = this.hasUniqueObjPaths(trackListMetaData, true);
    if (hasUniqueObjPaths) {
      this.setScrollbarPolicyAllways();
      trackListMetaData.forEach(Lang.bind(this, function(trackMetadata) {
        let metadata = {};
        this.parseMetadata(trackMetadata, metadata);
        //Don't add tracks with "/org/mpris/MediaPlayer2/TrackList/NoTrack" as the object path.
        //As per spec the "/org/mpris/MediaPlayer2/TrackList/NoTrack" object path means it's not a valid track.
        if (metadata.trackObj && metadata.trackObj !== '/org/mpris/MediaPlayer2/TrackList/NoTrack') {
          metadata.showRatings = showRatings;
          let trackUI = new TracklistItem(metadata, this.player);
          trackUI.connect('activate', Lang.bind(this, function() {
            this.player.playTrack(trackUI.obj);
          }));
          this.menu.addMenuItem(trackUI);
        }
      }));
      if (this.activeObject) {
        this.setObjectActive(this.activeObject);
      }
      this.updateScrollbarPolicy();
    }
  }

});

const Playlists = new Lang.Class({
    Name: "Playlists",
    Extends: ListSubMenu,

  _init: function(label, player) {
    this.parent(label);
    this.player = player;
  },

  loadPlaylists: function(playlists) {
    this.menu.removeAll();
    //As per spec all object paths MUST be unique.
    //If we don't have unique object paths reject the whole array.
    let hasUniqueObjPaths = this.hasUniqueObjPaths(playlists);
    if (hasUniqueObjPaths) {
      this.setScrollbarPolicyAllways();
      playlists.forEach(Lang.bind(this, function(playlist) {
        let [obj, name] = playlist;
        //Don't add playlists with just "/" as the object path.
        //Playlist object paths that just contain "/" are a way to
        //indicate invalid playlists as per spec.
        if (obj !== '/') {
          let playlistUI = new PlaylistItem(name, obj);
          playlistUI.connect('activate', Lang.bind(this, function() {
            this.player.playPlaylist(playlistUI.obj);
          }));
          this.menu.addMenuItem(playlistUI);
          }
      }));
      if (this.activeObject) {
        this.setObjectActive(this.activeObject);
      }
      this.updateScrollbarPolicy();
    }
  },

  updatePlaylist: function(UpdatedPlaylist) {
    let [obj, name] = UpdatedPlaylist;
    let playlistItem = this.getItem(obj);
    if (playlistItem) {
      playlistItem.updatePlaylistName(name);
    }
  }

});

const ListSubMenuItem = new Lang.Class({
    Name: "ListSubMenuItem",
    Extends: PopupMenu.PopupBaseMenuItem,

    _init: function () {
        this.parent();
        // We have to replace the _ornamentLabel so that it's vertically centered.
        this.actor.remove_actor(this._ornamentLabel);
        this._ornamentLabel = new St.Label({style_class: 'popup-menu-ornament'});
        this.actor.add(this._ornamentLabel, {y_expand: true, y_fill: false, y_align: St.Align.MIDDLE});
    }

});

const PlaylistItem = new Lang.Class({
    Name: "PlaylistItem",
    Extends: ListSubMenuItem,

    _init: function (text, obj) {
        this.parent();
        this.obj = obj;
        this.label = new St.Label({text: text});
        this.actor.add(this.label);
    },

    updatePlaylistName: function(name) {
      if (this.label.text != name) {
        this.label.text = name;
      }
    }

});

const TracklistItem = new Lang.Class({
    Name: "TracklistItem",
    Extends: ListSubMenuItem,

    _init: function (metadata, player) {
        this.parent();
        this._player = player;
        this._loveCallbackId = 0;
        this._banCallbackId = 0;
        this._tiredCallbackId = 0;
        this.obj = metadata.trackObj;
        this._setCoverIconAsync = Lib.setCoverIconAsync;
        this._rating = null;
        this._coverIcon = new St.Icon({icon_name: metadata.fallbackIcon, icon_size: 24});
        if (Settings.MINOR_VERSION > 19) {
          this._coverIcon.add_style_class_name('media-message-cover-icon fallback no-padding');
        }
        this._artistLabel = new St.Label({text: metadata.trackArtist, style_class: 'tracklist-artist'});
        this._titleLabel = new St.Label({text: metadata.trackTitle, style_class: 'track-info-album'});
        let style_class = 'no-padding';
        if (this._player._pithosRatings) {
          style_class = 'track-box';
        }
        this._ratingBox = new St.BoxLayout({style_class: style_class});
        this._ratingBox.hide();
        this._box = new St.BoxLayout({vertical: true});
        this._box.add_child(this._artistLabel);
        this._box.add_child(this._titleLabel);
        this._box.add_child(this._ratingBox);
        this.actor.add(this._coverIcon, {y_expand: false, y_fill: false, y_align: St.Align.MIDDLE});
        this.actor.add(this._box, {y_expand: false, y_fill: false, y_align: St.Align.MIDDLE});
        if (this._player._pithosRatings) {
          this._buildPithosRatings(metadata.pithosRating);
        }
        else {
          this._buildStars(metadata.trackRating);
        }
        this.showRatings(metadata.showRatings);
        this._setCoverIcon(metadata.trackCoverUrl, metadata.fallbackIcon);
    },

    updateMetadata: function(metadata) {
      this._setCoverIcon(metadata.trackCoverUrl, metadata.fallbackIcon);
      this._setArtist(metadata.trackArtist);
      this._setTitle(metadata.trackTitle);
      if (this._player._pithosRatings) {
        this._setPithosRating(metadata.pithosRating);
      }
      else {
        this._setRating(metadata.trackRating);
      }
    },

    _setArtist: function(artist) {
      if (this._artistLabel.text != artist) {
        this._artistLabel.text = artist;
      }
    },

    _setTitle: function(title) {
      if (this._titleLabel.text != title) {
        this._titleLabel.text = title;
      }
    },

    _setCoverIcon: function(coverUrl, fallbackIcon) {
      if (coverUrl) {
        this._setCoverIconAsync(this._coverIcon, coverUrl, fallbackIcon);
      }
      else {
        this._coverIcon.icon_name = fallbackIcon;
      }
    },

    _buildStars: function(value) {
      value = Math.min(Math.max(0, value), 5);
      this._starIcon = [];
      for(let i=0; i < 5; i++) {
        let icon_name = 'non-starred-symbolic';
        if (i < value) {
            icon_name = 'starred-symbolic';
        }
        // Create star icons
        this._starIcon[i] = new St.Icon({style_class: 'popup-menu-icon star-icon',
                                    icon_name: icon_name
                                    });
        this._ratingBox.add_child(this._starIcon[i]);
      }
      this._rating = value;
    },

    _buildPithosRatings: function(rating) {
      this._ratingsIcon = new St.Icon({style_class: 'popup-menu-icon star-icon', icon_size: 12});
      this._unRateButton = new St.Button({child: this._ratingsIcon});
      this._ratingBox.add(this._unRateButton);
      this._loveButton = new St.Button();
      this._ratingBox.add(this._loveButton);
      this._banButton = new St.Button();
      this._ratingBox.add(this._banButton);
      this._tiredButton = new St.Button();
      this._ratingBox.add(this._tiredButton);
      this._unrateCallbackId = this._unRateButton.connect('clicked', Lang.bind(this, function() {
        this._player._pithosRatings.UnRateSongRemote(this.obj);
      }));
      this._unRateButton.hide();
      this._ratingsIcon.set_width(-1);
      this._setPithosRating(rating);
    },

    _setPithosRating(rating) {
      if (this._rating == rating) {
        return;
      }
      if (this._loveCallbackId !== 0) {
        this._loveButton.disconnect(this._loveCallbackId);
      }
      if (this._banCallbackId !== 0) {
        this._banButton.disconnect(this._banCallbackId);
      }
      if (this._tiredCallbackId !== 0) {
        this._tiredButton.disconnect(this._tiredCallbackId);
      }
      if (rating == '') {
        this._ratingsIcon.icon_name = null;
        this._unRateButton.hide();
        this._loveButton.label = _("Love");
        this._banButton.label = _("Ban");
        this._tiredButton.label = _("Tired");
        this._loveCallbackId = this._loveButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.LoveSongRemote(this.obj);
        }));
        this._banCallbackId = this._banButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.BanSongRemote(this.obj);
        }));
        this._tiredCallbackId = this._tiredButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.TiredSongRemote(this.obj);
        }));
      }

      else if (rating == 'love') {
        this._ratingsIcon.icon_name = 'emblem-favorite-symbolic'
        this._unRateButton.show();
        this._loveButton.label = _("UnLove");
        this._banButton.label = _("Ban");
        this._tiredButton.label = _("Tired");
        this._loveCallbackId = this._loveButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.UnRateSongRemote(this.obj);
        }));
        this._banCallbackId = this._banButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.BanSongRemote(this.obj);
        }));
        this._tiredCallbackId = this._tiredButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.TiredSongRemote(this.obj);
        }));
      }
      else if (rating == 'ban') {
        this._ratingsIcon.icon_name = 'dialog-error-symbolic'
        this._unRateButton.show();
        this._loveButton.label = _("Love");
        this._banButton.label = _("UnBan");
        this._tiredButton.label = _("Tired");
        this._loveCallbackId = this._loveButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.LoveSongRemote(this.obj);
        }));
        this._banCallbackId = this._banButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.UnRateSongRemote(this.obj);
        }));
        this._tiredCallbackId = this._tiredButton.connect('clicked', Lang.bind(this, function() {
          this._player._pithosRatings.TiredSongRemote(this.obj);
        }));
      }
      else if (rating == 'tired') {
        if (this._unrateCallbackId !== 0) {
          this._unRateButton.disconnect(this._unrateCallbackId);
        }
        // Once a song has been set tired it's rating can't be changed.
        // No need to connect button signals.
        this._ratingsIcon.icon_name = 'go-jump-symbolic';
        this._unRateButton.show();
        this._loveButton.label = _("Tired… (Can't be Changed)");
        this._loveButton.reactive = false;
        this._unRateButton.reactive = false;
        this._banButton.hide();
        this._tiredButton.hide();
        this._unrateCallbackId = 0
        this._loveCallbackId = 0;
        this._banCallbackId = 0;
        this._tiredCallbackId = 0;
      }
      this._ratingsIcon.set_width(-1);
      this._rating = rating;
    },

  _setRating: function(value) {
    value = Math.min(Math.max(0, value), 5);
    if (this._rating != value) {
      this._rating = value;
      for (let i = 0; i < 5; i++) {
        let icon_name = 'non-starred-symbolic';
        if (i < value) {
            icon_name = 'starred-symbolic';
        }
        this._starIcon[i].icon_name = icon_name;
      }
    }
  },

  showRatings: function(value) {
    if (value) {
      this._ratingBox.show();
      this._coverIcon.icon_size = 48;
    }
    else {
      this._ratingBox.hide();
      this._coverIcon.icon_size = 24;
    }
  }

});
