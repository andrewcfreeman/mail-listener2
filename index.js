/**@module mail-listener5
 * @author Matej Malicek <matej@malicek.co>
 * @version 1.0.0
 * @date 4 March 2019
 */

 // Require statements
 var Imap = require('imap');
 var EventEmitter = require('events').EventEmitter;
 var simpleParser = require('mailparser').simpleParser;
 var fs = require('fs');
 var path = require('path');
 var async = require('async');
 
 class MailListener extends EventEmitter {
   constructor(options) {
     super();
     this.markSeen = !! options.markSeen;
     this.mailbox = options.mailbox || 'INBOX';
     this.processedMailbox = options.processedMailbox || 'INBOX';
     this.addLabelsOnSuccess = options.addLabelsOnSuccess || [];
     this.addLabelsOnFailure = options.addLabelsOnFailure || [];
     if ('string' === typeof options.searchFilter) 
     {
       this.searchFilter = [options.searchFilter];
     } 
     else 
     {
       this.searchFilter = options.searchFilter || ['UNSEEN'];
     }
     this.fetchUnreadOnStart = !! options.fetchUnreadOnStart;
     this.mailParserOptions = options.mailParserOptions || {};
     if (options.attachments && options.attachmentOptions && options.attachmentOptions.stream) 
     {
       this.mailParserOptions.streamAttachments = true;
     }
     this.attachmentOptions = options.attachmentOptions || {};
     this.attachments = options.attachments || false;
     this.attachmentOptions.directory = (this.attachmentOptions.directory ? this.attachmentOptions.directory : '');
     this.imap = new Imap({
       xoauth2: options.xoauth2,
       user: options.username,
       password: options.password,
       host: options.host,
       port: options.port,
       tls: options.tls,
       tlsOptions: options.tlsOptions || {},
       connTimeout: options.connTimeout || null,
       authTimeout: options.authTimeout || null,
       debug: options.debug || null
     });
     this.imap.on('ready', this.imapReady.bind(this));
     this.imap.on('close', this.imapClose.bind(this));
     this.imap.on('error', this.imapError.bind(this));
   }
 
   start() {
     this.imap.connect();
   }
 
   stop() {
     this.imap.connect();
   }

   destroy() {
     this.emit('server:destroying');  
     this.imap.destroy();
   }

   end() {
    this.emit('server:ending');  
    this.imap.end();
   }
 
   imapReady() {
     this.imap.openBox(this.mailbox, false, (error, mailbox) => {
       if (error)
       {
         this.emit('error', error);
       }
       else
       {
         this.emit('server:connected');
         this.emit('mailbox', mailbox);
         if (this.fetchUnreadOnStart)
         {
           this.parseUnread.call(this);
         }
         let listener = this.imapMail.bind(this);
         this.imap.on('mail', listener);
         this.imap.on('update', listener);
       }
     });
   }
 
   imapClose() {
     this.emit('server:disconnected');
   }
 
   imapError(error) {
     this.emit('error', error);
   }
 
   imapMail() {
     this.parseUnread.call(this);
   }
 
   parseUnread() {
     let self = this;
     self.imap.search(self.searchFilter, (error, results) => {
       if (error) 
       {
         self.emit('error', err);
       } 
       else if (results.length > 0) 
       {
         async.each(results, (result, callback) => {
           let f = self.imap.fetch(result, {
             bodies: '',
             markSeen: self.markSeen
           });
           f.on('message', (msg, seqno) => {  
             msg.on('body', async (stream, info) => {
               let parsed = await simpleParser(stream);
               self.emit('mail', parsed, seqno);
               self.emit('headers', parsed.headers, seqno);
               self.emit('body', {html: parsed.html, text: parsed.text, textAsHtml: parsed.textAsHtml}, seqno);
               if (parsed.attachments.length>0)
               {
                 for (let att of parsed.attachments)
                 {
                   if (self.attachments)
                   {
                     await fs.writeFileSync(`${self.attachmentOptions.directory}${att.filename}`, att.content, (error) =>{
                       self.emit('error', error);
                     });
                     self.emit('attachment', att, `${self.attachmentOptions.directory}${att.filename}`, seqno, result);
                   }
                   else
                   {
                     self.emit('attachment', att, null, seqno, result);
                   }
                 }
               }
             });
             
           });
           f.once('error', (error) => {
             self.emit('error', error);
           });
         }, (error) => {
           if (error) 
           {
             self.emit('error', error);
           }
         });
       }
     });
   }

   addLabel(uid, success) {
     let self = this;
    if(success) {
      self.imap.addLabels(uid, self.addLabelsOnSuccess, (err) => {
        self.emit(err);
      });
    } else {
      self.imap.addLabels(uid, self.addLabelsOnFailure, (err) => {
        self.emit(err);
      });
    }
    
   }

   moveToProcessedMailbox(uid) {
    let self = this;

    self.imap.status(self.processedMailbox, (err, box) => {
      if (box == null) {
        self.imap.addBox(self.processedMailbox, (err) => {
          self.emit(err);
          console.log('added box')
          console.log(err);
        }
        );
      }

      console.log('trying to move');
      self.imap.move(uid, self.processedMailbox, (err) => {
        self.emit(err);
      });
    });
   }
 };
 module.exports = MailListener;