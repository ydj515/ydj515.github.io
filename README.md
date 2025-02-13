# github.io
공부한 것들을 기록합니다.

`Chirpy Jekyll Theme`를 사용하였습니다. 자세한 사항은 [jekyll git repository][jekyllgit], [jekyll docs][docs] 를 참조해주세요.

## wiki
[Wiki][wiki]를 참조하여 작성합니다.

## prerequisite
- ruby 3.1.6

## install ruby
The installation process below applies to ARM arch Mac OS (m4)

1. rbenv install
    
    ```sh
    brew install rbenv ruby-build
    rbenv install -l # find available install versions
    ```

2. install ruby & rehash
   
   ```sh
    rbenv install 3.1.6
    rbenv global 3.1.6
    rbenv rehash
   ```

3. add rbenv path in `~/.zshrc`

    - `~/.zshrc` 
    ```
    export PATH={$Home}/.rbenv/bin:$PATH && \
    eval "$(rbenv init -)"
    ```

    - adjust
    ```sh
    source ~/.zshrc
    ```

4. bundle install

    ```sh
    gem install bundler
    bundler install
    ```

## start
```sh
bundle exec jekyll serve
```

[jekyllgit]: https://github.com/cotes2020/jekyll-theme-chirpy
[wiki]: https://github.com/cotes2020/jekyll-theme-chirpy/wiki
[docs]: https://jekyllrb-ko.github.io/docs/